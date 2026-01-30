import { json, type MetaFunction } from "@remix-run/node";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { integrationAPI, annotationAPI, loaderAPI } from "~/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Pickaxe, Download, Loader2, FileCode, ArrowRight, Network } from "lucide-react";

export const meta: MetaFunction = () => {
  return [
    { title: "Neural Subgraph Miner" },
    { name: "description", content: "Mine frequent patterns from your graph" },
  ];
};

export default function Mine() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [jobId, setJobId] = useState(searchParams.get("job_id") || "");
  const [minPatternSize, setMinPatternSize] = useState("3");
  const [maxPatternSize, setMaxPatternSize] = useState("5");
  const [minNeighborhoodSize, setMinNeighborhoodSize] = useState("3");
  const [maxNeighborhoodSize, setMaxNeighborhoodSize] = useState("5");
  const [nNeighborhoods, setNNeighborhoods] = useState("500");
  const [nTrials, setNTrials] = useState("100");
  const [outBatchSize, setOutBatchSize] = useState("3");
  const [searchStrategy, setSearchStrategy] = useState("greedy");
  const [sampleMethod, setSampleMethod] = useState("tree");
  const [graphType, setGraphType] = useState("directed");
  const [outputFormat, setOutputFormat] = useState("representative");

  const [isMining, setIsMining] = useState(false);
  const [miningResult, setMiningResult] = useState<{
    downloadUrl: string;
    patternsCount?: number;
  } | null>(null);

  // Progress state
  const [miningProgress, setMiningProgress] = useState(0);
  const [miningStatus, setMiningStatus] = useState("Initializing...");
  const [phaseDetail, setPhaseDetail] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const completedShownRef = useRef(false);
  const maxProgressSeenRef = useRef(0);

  // History State
  const [history, setHistory] = useState<any[]>([]);

  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    const initData = async () => {
      const urlJobId = searchParams.get("job_id");

      try {
        const res = await loaderAPI.get("api/history");
        const { selected_job_id, history } = res.data;

        let targetJobId = urlJobId || selected_job_id;

        if (history && history.length > 0) {
          // If we have a targetJobId, look for its NetworkX brother
          let bestMatch = null;
          // If we have a targetJobId, check if it's Mork and if there's a NetworkX brother
          if (targetJobId) {
            const currentJob = history.find((h: any) => h.job_id === targetJobId);
            if (currentJob?.writer_type === 'mork') {
              // Seek NetworkX brother from the same import batch (within 30s)
              const brother = history.find((h: any) =>
                h.writer_type === 'networkx' &&
                Math.abs(dayjs(h.imported_on).diff(dayjs(currentJob.imported_on), 'second')) < 60
              );
              bestMatch = brother || currentJob;
            } else {
              bestMatch = currentJob;
            }
          }

          //  Take the most recent NetworkX graph in existence
          if (!bestMatch) {
            bestMatch = history.find((h: any) => h.writer_type === 'networkx') || history[0];
          }

          if (bestMatch) {
            setJobId(bestMatch.job_id);
          }
        }

        if (history) {
          setHistory(history);
        }

      } catch (e) {
        console.error("Failed to load history from loader", e);
        toast.error("Connection error", {
          description: "Could not fetch your graph library."
        });
      } finally {
        setLoadingHistory(false);
      }
    };
    initData();
  }, [searchParams]);

  const startMining = async () => {
    if (!jobId) {
      toast.error("Please provide a Job ID");
      return;
    }

    try {
      setIsMining(true);
      setMiningResult(null);
      completedShownRef.current = false;

      // Create FormData to send as body (required by FastAPI Form handling)
      const formData = new FormData();
      formData.append("job_id", jobId);
      formData.append("min_pattern_size", minPatternSize);
      formData.append("max_pattern_size", maxPatternSize);
      formData.append("min_neighborhood_size", minNeighborhoodSize);
      formData.append("max_neighborhood_size", maxNeighborhoodSize);
      formData.append("n_neighborhoods", nNeighborhoods);
      formData.append("n_trials", nTrials);
      formData.append("out_batch_size", outBatchSize);
      formData.append("search_strategy", searchStrategy);
      formData.append("sample_method", sampleMethod);
      formData.append("graph_type", graphType);
      formData.append("graph_output_format", outputFormat);

      // Call the Integration Service API with FormData
      const response = await integrationAPI.post("/api/mine-patterns", formData);

      // Construct download URL - using the new /download-result endpoint logic if possible
      // Assuming backend returns relative path or we construct standard path
      // If response.data.download_url is missing, fallback to standard pattern
      const downloadLink = response.data.download_url ||
        `${integrationAPI.defaults.baseURL}/api/download-result?job_id=${jobId}`;

      setMiningResult({
        downloadUrl: downloadLink,
        patternsCount: response.data.patterns_count
      });

      if (!completedShownRef.current) toast.success("Mining completed successfully!");

    } catch (error: any) {
      console.error("Mining failed:", error);
      toast.error("Mining failed", {
        description: error.response?.data?.detail || error.message || "Unknown error occurred"
      });
    } finally {
      setIsMining(false);
      // Stop polling
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }
    }
  };

  // Poll for progress updates; when backend reports completed/100%, show result immediately so UI never stays stuck
  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    if (isMining && jobId) {
      setMiningProgress(0);
      setMiningStatus("Starting miner...");
      setPhaseDetail(null);
      maxProgressSeenRef.current = 0;

      intervalId = setInterval(async () => {
        try {
          const res = await integrationAPI.get(`/api/mining-status/${jobId}`);
          const data = res.data;

          if (data) {
            const progress = Math.min(100, Math.max(0, Number(data.progress) ?? 0));
            const prevMax = maxProgressSeenRef.current;
            const newMax = Math.max(prevMax, progress);
            maxProgressSeenRef.current = newMax;
            setMiningProgress((prev) => Math.max(prev, progress));
            if (progress >= prevMax - 0.5 && data.message != null) setMiningStatus(data.message);
            if (progress >= prevMax - 0.5 && data.phases && typeof data.phases === "object") {
              const phases = data.phases as Record<string, { current?: number; total?: number; percent?: number }>;
              const search = phases.search_trials;
              const sampling = phases.sampling;
              const saving = phases.saving;
              if (progress < 20) {
                if (sampling && typeof sampling.current === "number" && typeof sampling.total === "number" && Number(sampling.total) > 1) {
                  setPhaseDetail((prev) => (prev && prev.phase === "sampling" && prev.current > sampling.current! ? prev : { current: sampling.current!, total: sampling.total!, phase: "sampling" }));
                } else {
                  setPhaseDetail(null);
                }
              } else if (progress >= 20 && progress < 95 && search && Number(search.total) <= 1) {
                setPhaseDetail(null);
              } else if (progress >= 95 && saving && typeof saving.current === "number" && typeof saving.total === "number") {
                setPhaseDetail((prev) => (prev && prev.phase === "saving" && prev.current > saving.current! ? prev : { current: saving.current!, total: saving.total!, phase: "saving" }));
              } else if (progress >= 20 && search && typeof search.current === "number" && typeof search.total === "number" && Number(search.total) > 1) {
                setPhaseDetail((prev) => (prev && prev.phase === "search_trials" && prev.current > search.current! ? prev : { current: search.current!, total: search.total!, phase: "search_trials" }));
              }
            }

            // Backend is done (status completed or 100%) — unblock UI even if POST /mine-patterns hasn't returned
            const completed = data.status === "completed" || progress >= 100;
            if (completed && pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setPollInterval(null);
              setMiningProgress(100);
              setMiningStatus(data.message || "Mining completed successfully!");
              setMiningResult({
                downloadUrl: `${integrationAPI.defaults.baseURL}/api/download-result?job_id=${jobId}`,
                patternsCount: undefined,
              });
              setIsMining(false);
              completedShownRef.current = true;
              toast.success("Mining completed successfully!");
            }
          }
        } catch (e) {
          console.warn("Failed to poll progress", e);
        }
      }, 250);

      pollIntervalRef.current = intervalId;
      setPollInterval(intervalId);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        pollIntervalRef.current = null;
      }
    };
  }, [isMining, jobId]);

  const activeGraph = history.find(h => h.job_id === jobId && h.writer_type === 'networkx')
    || history.find(h => h.job_id === jobId);

  const graphDisplayName = activeGraph
    ? `${activeGraph.writer_type.charAt(0).toUpperCase() + activeGraph.writer_type.slice(1)} Graph - ${activeGraph.node_count.toLocaleString()} nodes`
    : (jobId ? "Selected Graph" : "No graph selected");

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <div>
          <Pickaxe size={48} className="text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Neural Subgraph Miner</h1>
          <p className="text-muted-foreground">
            Discover frequent patterns and motifs in your generated graph.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Configuration Section */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <FileCode className="w-5 h-5" /> Mining Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">
                  Active Knowledge Graph
                </Label>
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Pickaxe className="text-primary" size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">
                        {loadingHistory ? "Loading graph..." : graphDisplayName}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                        {activeGraph ? `Imported ${dayjs(activeGraph.imported_on).fromNow()}` : "Select a graph to start mining"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                    onClick={() => navigate("/settings")}
                  >
                    Change Graph
                  </Button>
                </div>
              </div>
            </div>

            <Accordion type="single" collapsible defaultValue="advanced">
              <AccordionItem value="advanced">
                <AccordionTrigger>Configuration Parameters</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">

                    <div className="space-y-2">
                      <Label htmlFor="min-size">Min Pattern Size</Label>
                      <Input
                        id="min-size"
                        type="number"
                        min={1}
                        value={minPatternSize}
                        onChange={(e) => setMinPatternSize(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-size">Max Pattern Size</Label>
                      <Input
                        id="max-size"
                        type="number"
                        min={parseInt(minPatternSize)}
                        value={maxPatternSize}
                        onChange={(e) => setMaxPatternSize(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="min-neighborhood">Min Neighborhood Size</Label>
                      <Input
                        id="min-neighborhood"
                        type="number"
                        min={1}
                        value={minNeighborhoodSize}
                        onChange={(e) => setMinNeighborhoodSize(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-neighborhood">Max Neighborhood Size</Label>
                      <Input
                        id="max-neighborhood"
                        type="number"
                        min={parseInt(minNeighborhoodSize)}
                        value={maxNeighborhoodSize}
                        onChange={(e) => setMaxNeighborhoodSize(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="n-neighborhoods">Num Neighborhoods</Label>
                      <Input
                        id="n-neighborhoods"
                        type="number"
                        min={1}
                        value={nNeighborhoods}
                        onChange={(e) => setNNeighborhoods(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="n-trials">Num Trials</Label>
                      <Input
                        id="n-trials"
                        type="number"
                        min={1}
                        value={nTrials}
                        onChange={(e) => setNTrials(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="out-batch-size">Output size (patterns per size)</Label>
                      <Input
                        id="out-batch-size"
                        type="number"
                        min={1}
                        value={outBatchSize}
                        onChange={(e) => setOutBatchSize(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Max number of patterns to keep for each pattern size (e.g. size 3, 4, 5).
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="strategy">Search Strategy</Label>
                      <Select
                        value={searchStrategy}
                        onValueChange={setSearchStrategy}
                      >
                        <SelectTrigger id="strategy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="greedy">Greedy</SelectItem>
                          <SelectItem value="mcts">MCTS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="method">Sampling Method</Label>
                      <Select
                        value={sampleMethod}
                        onValueChange={setSampleMethod}
                      >
                        <SelectTrigger id="method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tree">Tree</SelectItem>
                          <SelectItem value="radius">Radius</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="graph-type">Graph Type</Label>
                      <Select
                        value={graphType}
                        onValueChange={setGraphType}
                      >
                        <SelectTrigger id="graph-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="directed">Directed</SelectItem>
                          <SelectItem value="undirected">Undirected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="format">Output Format</Label>
                      <Select
                        value={outputFormat}
                        onValueChange={setOutputFormat}
                      >
                        <SelectTrigger id="format">
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="representative">Representative</SelectItem>
                          <SelectItem value="instance">Instances</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Show Button OR Progress Card */}
            {!isMining ? (
              <Button
                className="w-full md:w-auto md:min-w-[200px]"
                size="lg"
                disabled={!jobId}
                onClick={startMining}
              >
                <Pickaxe className="mr-2 h-4 w-4" /> Start Mining
              </Button>
            ) : (
              <Card className="border-green-800 bg-card shadow-lg animate-in fade-in zoom-in-95 duration-300">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                        <h3 className="font-semibold text-foreground">Mining In Progress...</h3>
                      </div>
                      <span className="text-sm font-bold text-green-500">{miningProgress}%</span>
                    </div>

                    <div className="space-y-2">
                      <div className="w-full bg-secondary h-3 rounded-full overflow-hidden border border-border">
                        <div
                          className="bg-green-600 h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(22,163,74,0.5)]"
                          style={{ width: `${miningProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground font-medium text-right font-mono tracking-tight">
                        {miningStatus}
                      </p>
                      {phaseDetail && Number(phaseDetail.total) > 1 && !(phaseDetail.phase === "search_trials" && phaseDetail.current === 0 && Number(phaseDetail.total) === 1) && (phaseDetail.phase !== "search_trials" || !String(miningStatus).toLowerCase().includes("sampling")) && (
                        <p className="text-xs text-foreground/70 font-mono">
                          {phaseDetail.phase === "search_trials" && `${phaseDetail.current} of ${phaseDetail.total} trials`}
                          {phaseDetail.phase === "sampling" && `${phaseDetail.current} of ${phaseDetail.total} neighborhoods`}
                          {phaseDetail.phase === "saving" && `${phaseDetail.current} of ${phaseDetail.total} sizes`}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        {miningResult && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Mining Complete!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium mb-1">Results are ready for download.</p>
                  {miningResult.patternsCount !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      Found approximately {miningResult.patternsCount} patterns.
                    </p>
                  )}
                </div>
                <Button
                  className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => window.open(miningResult.downloadUrl, '_blank')}
                >
                  <Download className="mr-2 h-4 w-4" /> Download Results (ZIP)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div >
  );
}
