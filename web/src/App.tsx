import { useEffect, useRef, useState } from 'react';
import type {
  AiAdviceReport,
  AiConfigStatus,
  CheckDimensionId,
  GitPlatform,
  RiskSeverity,
  ScanReport,
} from '@repo-checkup/shared';
import {
  FileCheck2,
  FolderSearch,
  KeyRound,
  Loader2,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import {
  AiAdviceSection,
  type AiUiConfigState,
} from './components/AiAdviceSection';
import { RepoInputBar } from './components/RepoInputBar';
import { RiskList } from './components/RiskList';
import { ScoreOverview } from './components/ScoreOverview';
import {
  fetchAiModels,
  generateAiAdvice,
  getAiConfigStatus,
  ScanApiError,
  scanRepository,
} from './lib/api';

interface PlatformMeta {
  id: GitPlatform;
  label: string;
}

interface DimensionPreview {
  id: CheckDimensionId;
  title: string;
  weight: string;
  description: string;
  icon: typeof FileCheck2;
}

const SUPPORTED_PLATFORMS: PlatformMeta[] = [
  { id: 'github', label: 'GitHub' },
  { id: 'gitcode', label: 'GitCode' },
  { id: 'gitee', label: 'Gitee' },
];

const DIMENSION_PREVIEWS: DimensionPreview[] = [
  {
    id: 'completeness',
    title: '基础完整度',
    weight: '25 分',
    description: '检查 README 文档、依赖清单及启动脚本是否齐全。',
    icon: FileCheck2,
  },
  {
    id: 'windows_scripts',
    title: 'Windows 专用脚本',
    weight: '20 分',
    description: '排查 .bat、.cmd、.ps1、.vbs 等影响跨平台部署的脚本。',
    icon: TerminalSquare,
  },
  {
    id: 'hardcoded_paths',
    title: '硬编码路径',
    weight: '25 分',
    description: '识别源码与配置中的 C:\\、/Users/ 等本机绝对路径。',
    icon: FolderSearch,
  },
  {
    id: 'secrets',
    title: '密钥与敏感信息风险',
    weight: '30 分',
    description: '检测 sk-、AKID、Bearer、私钥特征及 .env 直接入库风险。',
    icon: KeyRound,
  },
];

export default function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeScanUrl, setActiveScanUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<
    CheckDimensionId | 'all'
  >('all');
  const [selectedSeverity, setSelectedSeverity] = useState<
    RiskSeverity | 'all'
  >('all');
  const scanSeqRef = useRef(0);

  const [aiConfigStatus, setAiConfigStatus] = useState<AiConfigStatus | null>(
    null,
  );
  const [aiUiConfig, setAiUiConfig] = useState<AiUiConfigState>({
    baseUrl: '',
    apiKey: '',
    model: '',
    availableModels: [],
    showCustomPanel: false,
  });
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<AiAdviceReport | null>(null);
  const aiSeqRef = useRef(0);

  useEffect(() => {
    let active = true;
    getAiConfigStatus()
      .then((status) => {
        if (!active) return;
        setAiConfigStatus(status);
        setAiUiConfig((prev) => ({
          ...prev,
          baseUrl: prev.baseUrl || status.defaultBaseUrl || '',
          model: prev.model || status.defaultModel || '',
          showCustomPanel: !status.hasEnvConfig,
        }));
      })
      .catch(() => {
        // Keep main workflow unaffected if AI config probe fails.
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleScan() {
    const trimmed = repoUrl.trim();
    if (!trimmed) {
      setError('请输入公开的 GitHub、GitCode 或 Gitee 仓库链接');
      return;
    }

    const currentSeq = ++scanSeqRef.current;
    aiSeqRef.current++;
    setLoading(true);
    setActiveScanUrl(trimmed);
    setError(null);
    setReport(null);
    setAiReport(null);
    setAiNotice(null);
    setLoadingAdvice(false);
    setSelectedDimension('all');
    setSelectedSeverity('all');

    try {
      const nextReport = await scanRepository(trimmed);
      if (scanSeqRef.current !== currentSeq) {
        return;
      }
      setReport(nextReport);
    } catch (err) {
      if (scanSeqRef.current !== currentSeq) {
        return;
      }
      if (err instanceof ScanApiError) {
        setError(err.message);
      } else {
        setError('体检请求失败，请确认后端服务已正常启动');
      }
    } finally {
      if (scanSeqRef.current === currentSeq) {
        setLoading(false);
        setActiveScanUrl(null);
      }
    }
  }

  async function handleFetchModels() {
    const hasEnv = Boolean(aiConfigStatus?.hasEnvConfig);
    const hasCustomKey = Boolean(aiUiConfig.apiKey.trim());
    if (!hasEnv && !hasCustomKey) {
      setAiNotice('请先填写 API Key（或在本地 .env 中配置 AI_API_KEY），再拉取可用模型列表。');
      setAiUiConfig((prev) => ({ ...prev, showCustomPanel: true }));
      return;
    }

    setLoadingModels(true);
    setAiNotice(null);

    try {
      const res = await fetchAiModels({
        ...(aiUiConfig.baseUrl.trim()
          ? { baseUrl: aiUiConfig.baseUrl.trim() }
          : {}),
        ...(aiUiConfig.apiKey.trim()
          ? { apiKey: aiUiConfig.apiKey.trim() }
          : {}),
      });

      setAiUiConfig((prev) => ({
        ...prev,
        availableModels: res.models,
        model: prev.model.trim() || res.models[0] || '',
      }));

      if (res.models.length === 0) {
        setAiNotice('接口返回成功但模型列表为空，请在输入框中手动填写模型名称。');
      }
    } catch (err) {
      setAiNotice(
        err instanceof ScanApiError
          ? err.message
          : '拉取模型列表失败，你也可以直接手动填写模型名称。',
      );
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleGenerateAdvice() {
    if (!report) return;

    const hasEnv = Boolean(aiConfigStatus?.hasEnvConfig);
    const hasCustomKey = Boolean(aiUiConfig.apiKey.trim());
    if (!hasEnv && !hasCustomKey) {
      setAiNotice('尚未配置 AI API Key：请在本地 .env 中配置，或在上方设置面板填写 Base URL 与 API Key 后再生成。');
      setAiUiConfig((prev) => ({ ...prev, showCustomPanel: true }));
      return;
    }

    const effectiveModel =
      aiUiConfig.model.trim() || aiConfigStatus?.defaultModel || '';
    if (!effectiveModel) {
      setAiNotice('请先拉取并选择模型，或手动填写模型名称（例如 gpt-4o-mini）。');
      setAiUiConfig((prev) => ({ ...prev, showCustomPanel: true }));
      return;
    }

    const currentAiSeq = ++aiSeqRef.current;
    setLoadingAdvice(true);
    setAiNotice(null);

    try {
      const advice = await generateAiAdvice({
        report,
        config: {
          ...(aiUiConfig.baseUrl.trim()
            ? { baseUrl: aiUiConfig.baseUrl.trim() }
            : {}),
          ...(aiUiConfig.apiKey.trim()
            ? { apiKey: aiUiConfig.apiKey.trim() }
            : {}),
          model: effectiveModel,
        },
      });
      if (aiSeqRef.current !== currentAiSeq) {
        return;
      }
      setAiReport(advice);
    } catch (err) {
      if (aiSeqRef.current !== currentAiSeq) {
        return;
      }
      setAiNotice(
        err instanceof ScanApiError
          ? err.message
          : '生成 AI 建议失败，请检查模型配置或稍后重试。',
      );
    } finally {
      if (aiSeqRef.current === currentAiSeq) {
        setLoadingAdvice(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Git 仓库接入体检
              </h1>
              <p className="text-xs text-slate-500">
                Repo Checkup · 接入就绪度评估与风险排查
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {SUPPORTED_PLATFORMS.map((platform) => (
              <span
                key={platform.id}
                className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {platform.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <RepoInputBar
          repoUrl={repoUrl}
          loading={loading}
          error={error}
          onChangeUrl={(nextUrl) => {
            setRepoUrl(nextUrl);
            if (error) setError(null);
            if (!nextUrl.trim() && !loading) {
              aiSeqRef.current++;
              setReport(null);
              setAiReport(null);
              setAiNotice(null);
              setLoadingAdvice(false);
              setSelectedDimension('all');
              setSelectedSeverity('all');
            }
          }}
          onSubmit={handleScan}
        />

        {loading && (
          <section className="flex items-center gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6">
            <Loader2 className="h-6 w-6 shrink-0 animate-spin text-indigo-600" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-indigo-950">
                正在浅克隆仓库并执行四大维度体检...
              </h3>
              {activeScanUrl && (
                <p className="mt-0.5 truncate font-mono text-xs text-indigo-800">
                  {activeScanUrl}
                </p>
              )}
              <p className="mt-1 text-xs text-indigo-700">
                正在拉取目标分支、记录 Commit 信息、清理 .git 目录并分析代码结构与敏感信息，完成后会自动清理临时目录。
              </p>
            </div>
          </section>
        )}

        {report && !loading && (
          <>
            <ScoreOverview
              report={report}
              selectedDimension={selectedDimension}
              onSelectDimension={setSelectedDimension}
            />
            <AiAdviceSection
              configStatus={aiConfigStatus}
              uiConfig={aiUiConfig}
              loadingModels={loadingModels}
              loadingAdvice={loadingAdvice}
              notice={aiNotice}
              aiReport={aiReport}
              onUpdateConfig={(patch) => {
                setAiUiConfig((prev) => ({ ...prev, ...patch }));
                if (aiNotice) setAiNotice(null);
              }}
              onFetchModels={handleFetchModels}
              onGenerateAdvice={handleGenerateAdvice}
            />
            <RiskList
              risks={report.risks}
              selectedDimension={selectedDimension}
              selectedSeverity={selectedSeverity}
              onSelectDimension={setSelectedDimension}
              onSelectSeverity={setSelectedSeverity}
            />
          </>
        )}

        {!report && !loading && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                四大核心体检维度
              </h2>
              <span className="text-xs text-slate-500">
                输入上方仓库链接后生成可视化报告
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {DIMENSION_PREVIEWS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="font-medium text-slate-900">
                          {item.title}
                        </h3>
                      </div>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {item.weight}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
