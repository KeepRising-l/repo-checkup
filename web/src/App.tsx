import { useEffect, useRef, useState } from 'react';
import type {
  AiAdviceReport,
  AiConfigStatus,
  CheckDimensionId,
  GitPlatform,
  RiskSeverity,
  ScanProgressEvent,
  ScanReport,
} from '@repo-checkup/shared';
import {
  FileCheck2,
  FolderSearch,
  KeyRound,
  TerminalSquare,
} from 'lucide-react';
import {
  AiAdviceSection,
  type AiUiConfigState,
} from './components/AiAdviceSection';
import { RepoInputBar } from './components/RepoInputBar';
import { RiskList } from './components/RiskList';
import { ScanProgressBar } from './components/ScanProgressBar';
import { ScoreOverview } from './components/ScoreOverview';
import {
  fetchAiModels,
  generateAiAdvice,
  getAiConfigStatus,
  saveAiConfig,
  ScanApiError,
  scanRepositoryStream,
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
  const [scanStartedAt, setScanStartedAt] = useState<number>(0);
  const [scanProgress, setScanProgress] = useState<ScanProgressEvent | null>(
    null,
  );
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
  const [savingConfig, setSavingConfig] = useState(false);
  const [aiSaveSuccess, setAiSaveSuccess] = useState<string | null>(null);
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

  useEffect(() => {
    if (!loading) return;

    const STAGE_CAPS: Record<ScanProgressEvent['stage'], number> = {
      validate: 11,
      clone: 64,
      metadata: 73,
      scan: 91,
      score: 97,
      done: 100,
    };

    const id = window.setInterval(() => {
      setScanProgress((prev) => {
        if (!prev) return prev;
        const cap = STAGE_CAPS[prev.stage] ?? 95;
        if (prev.percent >= cap) return prev;
        return { ...prev, percent: prev.percent + 1 };
      });
    }, 350);

    return () => window.clearInterval(id);
  }, [loading]);

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
    setScanStartedAt(Date.now());
    setScanProgress({
      stage: 'validate',
      percent: 4,
      label: '正在连接服务端并准备拉取仓库',
    });
    setError(null);
    setReport(null);
    setAiReport(null);
    setAiNotice(null);
    setLoadingAdvice(false);
    setSelectedDimension('all');
    setSelectedSeverity('all');

    try {
      const nextReport = await scanRepositoryStream(trimmed, (event) => {
        if (scanSeqRef.current !== currentSeq) return;
        setScanProgress((prev) => {
          const nextPercent = prev
            ? Math.max(prev.percent, event.percent)
            : event.percent;
          return { ...event, percent: nextPercent };
        });
      });

      if (scanSeqRef.current !== currentSeq) {
        return;
      }

      setScanProgress({
        stage: 'done',
        percent: 100,
        label: '体检完成，正在生成可视化报告',
      });
      await new Promise((resolve) => setTimeout(resolve, 220));
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
        setScanProgress(null);
      }
    }
  }

  async function handleFetchModels() {
    const hasEnv = Boolean(aiConfigStatus?.hasEnvConfig);
    const hasCustomKey = Boolean(aiUiConfig.apiKey.trim());
    if (!hasEnv && !hasCustomKey) {
      setAiNotice(
        '请先填写 API Key（或在本地 .env 中配置 AI_API_KEY），再拉取可用模型列表。',
      );
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
        setAiNotice(
          '接口返回成功但模型列表为空，请在输入框中手动填写模型名称。',
        );
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

  async function handleSaveAiConfig() {
    const hasEnv = Boolean(aiConfigStatus?.hasEnvConfig);
    const hasCustomKey = Boolean(aiUiConfig.apiKey.trim());
    if (!hasEnv && !hasCustomKey) {
      setAiNotice('请先填写 API Key，再点击保存到本地 .env。');
      setAiUiConfig((prev) => ({ ...prev, showCustomPanel: true }));
      return;
    }

    const effectiveBaseUrl =
      aiUiConfig.baseUrl.trim() || aiConfigStatus?.defaultBaseUrl || '';
    if (!effectiveBaseUrl) {
      setAiNotice('请先选择厂商或填写 Base URL，再点击保存。');
      setAiUiConfig((prev) => ({ ...prev, showCustomPanel: true }));
      return;
    }

    setSavingConfig(true);
    setAiNotice(null);
    setAiSaveSuccess(null);

    try {
      const updated = await saveAiConfig({
        baseUrl: effectiveBaseUrl,
        ...(aiUiConfig.apiKey.trim()
          ? { apiKey: aiUiConfig.apiKey.trim() }
          : {}),
        ...(aiUiConfig.model.trim()
          ? { model: aiUiConfig.model.trim() }
          : {}),
      });

      setAiConfigStatus(updated);
      setAiUiConfig((prev) => ({
        ...prev,
        apiKey: '',
        baseUrl: updated.defaultBaseUrl ?? prev.baseUrl,
        model: updated.defaultModel ?? prev.model,
        showCustomPanel: false,
      }));
      setAiSaveSuccess('已保存到本地 .env，刷新页面或重启后自动生效');
    } catch (err) {
      setAiNotice(
        err instanceof ScanApiError
          ? err.message
          : '保存配置到本地 .env 失败，请稍后重试。',
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleGenerateAdvice() {
    if (!report) return;

    const hasEnv = Boolean(aiConfigStatus?.hasEnvConfig);
    const hasCustomKey = Boolean(aiUiConfig.apiKey.trim());
    if (!hasEnv && !hasCustomKey) {
      setAiNotice(
        '尚未配置 AI API Key：请在本地 .env 中配置，或在上方设置面板填写 Base URL 与 API Key 后再生成。',
      );
      setAiUiConfig((prev) => ({ ...prev, showCustomPanel: true }));
      return;
    }

    const effectiveModel =
      aiUiConfig.model.trim() || aiConfigStatus?.defaultModel || '';
    if (!effectiveModel) {
      setAiNotice(
        '请先拉取并选择模型，或手动填写模型名称（例如 deepseek-chat）。',
      );
      setAiUiConfig((prev) => ({ ...prev, showCustomPanel: true }));
      return;
    }

    const currentAiSeq = ++aiSeqRef.current;
    setLoadingAdvice(true);
    setAiNotice(null);
    setAiUiConfig((prev) =>
      prev.showCustomPanel ? { ...prev, showCustomPanel: false } : prev,
    );

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
    <div className="min-h-screen bg-[#f5f5f4] text-[#1c1917]">
      <header className="sticky top-0 z-30 border-b border-[#e7e5e4] bg-[#fafaf9]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1c1917] font-mono text-xs font-bold tracking-tight text-white">
              RC
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-[#1c1917]">
                Git 仓库接入体检
              </h1>
              <p className="text-xs text-[#78716c]">
                Repo Checkup · 接入就绪度评估与风险排查
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {SUPPORTED_PLATFORMS.map((platform) => (
              <span
                key={platform.id}
                className="rounded-full border border-[#e7e5e4] bg-white px-3 py-1 text-xs font-medium text-[#57534e]"
              >
                {platform.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-7 px-6 py-8">
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

        {loading && scanProgress && (
          <ScanProgressBar
            repoUrl={activeScanUrl ?? repoUrl}
            progress={scanProgress}
            startedAt={scanStartedAt}
          />
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
              savingConfig={savingConfig}
              saveSuccess={aiSaveSuccess}
              notice={aiNotice}
              aiReport={aiReport}
              onUpdateConfig={(patch) => {
                setAiUiConfig((prev) => ({ ...prev, ...patch }));
                if (aiNotice) setAiNotice(null);
                if (aiSaveSuccess) setAiSaveSuccess(null);
              }}
              onFetchModels={handleFetchModels}
              onSaveConfig={handleSaveAiConfig}
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
              <h2 className="text-sm font-semibold text-[#1c1917]">
                四大核心扫描维度 · 六维能力雷达
              </h2>
              <span className="text-xs text-[#78716c]">
                输入上方仓库链接后生成可视化报告
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {DIMENSION_PREVIEWS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[#e7e5e4] bg-white p-6 shadow-[0_2px_10px_rgba(28,25,23,0.03)] transition hover:border-[#d6d3d1]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-[#e7e5e4] bg-[#fafaf9] p-2.5 text-[#1c1917]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="text-sm font-semibold text-[#1c1917]">
                          {item.title}
                        </h3>
                      </div>
                      <span className="rounded-full border border-[#e7e5e4] bg-[#fafaf9] px-2.5 py-0.5 font-mono text-xs font-medium text-[#57534e]">
                        {item.weight}
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#78716c]">
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
