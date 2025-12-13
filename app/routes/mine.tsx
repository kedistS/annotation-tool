import { json, type MetaFunction } from "@remix-run/node";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { toast } from "sonner";
import { integrationAPI } from "~/api";
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
import { Pickaxe, Download, Loader2, FileCode } from "lucide-react";

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
  const [searchStrategy, setSearchStrategy] = useState("greedy");
  const [sampleMethod, setSampleMethod] = useState("tree");
  const [graphType, setGraphType] = useState("directed");
  const [outputFormat, setOutputFormat] = useState("representative");

  const [isMining, setIsMining] = useState(false);
  const [miningResult, setMiningResult] = useState<{
    downloadUrl: string;
    patternsCount?: number;
  } | null>(null);

  const startMining = async () => {
    if (!jobId) {
      toast.error("Please provide a Job ID");
      return;
    }

    try {
      setIsMining(true);
      setMiningResult(null);

      // Create FormData to send as body (required by FastAPI Form handling)
      const formData = new FormData();
      formData.append("job_id", jobId);
      formData.append("min_pattern_size", minPatternSize);
      formData.append("max_pattern_size", maxPatternSize);
      formData.append("min_neighborhood_size", minNeighborhoodSize);
      formData.append("max_neighborhood_size", maxNeighborhoodSize);
      formData.append("n_neighborhoods", nNeighborhoods);
      formData.append("n_trials", nTrials);
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

      toast.success("Mining completed successfully!");

    } catch (error: any) {
      console.error("Mining failed:", error);
      toast.error("Mining failed", {
        description: error.response?.data?.detail || error.message || "Unknown error occurred"
      });
    } finally {
      setIsMining(false);
    }
  };

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
            <div className="grid gap-2">
              <Label htmlFor="job-id">Job ID</Label>
              <Input
                id="job-id"
                placeholder="Enter the Job ID from the import step"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                The unique identifier for the graph generated in the previous step.
              </p>
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

            <Button
              className="w-full md:w-auto md:min-w-[200px]"
              size="lg"
              disabled={isMining || !jobId}
              onClick={startMining}
            >
              {isMining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mining Patterns...
                </>
              ) : (
                <>
                  <Pickaxe className="mr-2 h-4 w-4" /> Start Mining
                </>
              )}
            </Button>
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
    </div>
  );
}
