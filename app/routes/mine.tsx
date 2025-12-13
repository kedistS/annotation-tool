import { useSearchParams } from "@remix-run/react";
import { type MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [{ title: "NeuroGraph - Neural Subgraph Miner" }];
};

export default function Mine() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job_id") || "";

  return (
    <div className="p-12">
      <h1 className="text-3xl font-bold mb-6">Neural Subgraph Miner</h1>
      <p className="mb-4">Job ID: {jobId}</p>
      <div className="p-4 border border-dashed rounded bg-muted/50">
        Mining Interface Loading...
      </div>
    </div>
  );
}
