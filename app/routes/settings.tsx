import {
  LoaderFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { useNavigate, useLoaderData } from "@remix-run/react";
import {
  CheckCircle2,
  ChevronsLeftRightEllipsis,
  CircleDot,
  Database,
  BrainCircuit,
  ArrowRight,
} from "lucide-react";
import { SummaryData } from "./_index";
import { loaderAPI } from "~/api";
import Graph from "~/components/graph";
import { useState } from "react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import type { ColumnDef, Table as TableType } from "@tanstack/react-table";
import {
  MinimalDataTablePagination,
  useDataTable,
} from "~/components/data-table";
import ErrorBoundaryContent from "~/components/error-boundary";

export const loader: LoaderFunction = async () => {
  const data: { selected_job_id: string; history: SummaryData[] } = (
    await loaderAPI.get("api/history", {})
  ).data;
  return data;
};

export default function Settings() {
  const data: { selected_job_id: string; history: SummaryData[] } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [currentJobId, setCurrentJobId] = useState(data.selected_job_id);

  const history = data.history || [];

  const columns: ColumnDef<SummaryData>[] = [
    {
      id: "job_id",
      accessorKey: "job_id",
    },
    {
      id: "node_count",
      accessorKey: "node_count",
    },
    {
      id: "edge_count",
      accessorKey: "edge_count",
    },
    {
      id: "imported_on",
      accessorKey: "imported_on",
    },
    {
      id: "schema",
      accessorKey: "schema",
    },
    {
      id: "selected",
      accessorFn: (row) => (row.job_id === data.selected_job_id ? 2 : 1),
    },
  ];

  const table: TableType<SummaryData> = useDataTable(columns, history, {
    sorting: [
      {
        id: "selected",
        desc: true,
      },
    ],
    pagination: {
      pageSize: 3,
    },
  });

  function colorMapping(graph: SummaryData["schema"]) {
    if (!graph.nodes) return;
    const uniqueNodeTypes = new Set(
      graph.nodes.map((n) => n.data.id as string)
    );
    const map = [
      "#EF4444",
      "#22C55E",
      "#F97316",
      "#3B82F6",
      "#EAB308",
      "#8B5CF6",
      "#84CC16",
      "#EC4899",
      "#14B8A6",
      "#6366F1",
      "#06B6D4",
      "#F472B6",
      "#0EA5E9",
      "#A855F7",
      "#6B7280",
    ];
    return [...uniqueNodeTypes].reduce(
      (a, c, i) => ({ ...a, [c]: map[i % map.length] }),
      {}
    );
  }

  async function switchAtomspace(job_id: string, redirectToMine: boolean = false) {
    toast.promise(loaderAPI.post("api/select-job", { job_id }, {}), {
      loading: "Switching atomspace, please wait ...",
      success: () => {
        setCurrentJobId(job_id);
        if (redirectToMine) {
          navigate(`/mine?job_id=${job_id}`);
        }
        return `New atomspace selected.`;
      },
      error: "Could not switch atomspace, please try again.",
    });
  }

  return (
    <div className="py-4 px-12">
      <div className="flex justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
        <div className="grid gap-2 grid-flow-col"></div>
      </div>
      <div>
        <h2 className="font-bold">Graph Library</h2>
        <p className="text-muted-foreground mb-4">
          Explore your imported data sources and manage active contexts.
        </p>
        <div className="grid grid-cols-3 gap-4 mb-2">
          {table.getRowModel().rows?.length
            ? table.getRowModel().rows.map((row) => {
              const isNetworkX = row.original.writer_type === 'networkx';
              const isDirectlySelected = row.getValue("job_id") == currentJobId;

              // Priority marker: Show as selected if it matches Job ID AND is either the active one OR the NetworkX brother of the active one
              const hasNetworkXBrother = data.history.some(h => (h.job_id === row.original.job_id || h.job_id === row.getValue("job_id")) && h.writer_type === 'networkx');
              const isSelected = isDirectlySelected && (hasNetworkXBrother ? isNetworkX : true);

              return (
                <div
                  key={`${row.original.job_id}-${row.original.writer_type}`}
                  className={`relative border rounded-xl overflow-hidden hover:border-foreground/50 transition-all duration-300 group ${isSelected
                    ? "border-2 border-green-500 bg-green-500/5 ring-1 ring-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                    : "border-border/50 bg-card/30"
                    }`}
                >
                  <div className="h-[200px] hover:cursor-pointer relative" onClick={() => switchAtomspace(row.getValue("job_id"))}>
                    <Graph
                      elements={row.getValue("schema")}
                      colorMapping={colorMapping(row.getValue("schema"))}
                      hideControls={true}
                      layout={{
                        name: "dagre",
                        nodeDimensionsIncludeLabels: true,
                        rankSep: 20,
                        edgeSep: 0,
                        rankDir: "LR",
                      } as any}
                    ></Graph>
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1 border-2 border-background shadow-lg">
                        <CheckCircle2 size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-background/40 backdrop-blur-sm border-t border-border/50">
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="flex items-center px-2 py-0.5 bg-primary/10 rounded-md border border-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary">
                        <Database size={10} className="mr-1" />
                        {row.original.writer_type}
                      </span>
                      <p className="flex items-center text-xs text-muted-foreground">
                        <CircleDot size={12} className="inline me-1" />
                        {(row.getValue("node_count") as number).toLocaleString()}
                      </p>
                      <p className="flex items-center text-xs text-muted-foreground">
                        <ChevronsLeftRightEllipsis size={12} className="inline me-1" />
                        {(row.getValue("edge_count") as number).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/20">
                      <p className="text-[10px] text-muted-foreground italic font-medium">
                        {dayjs(row.getValue("imported_on")).fromNow()}
                      </p>

                      {isNetworkX && (
                        <Button
                          size="sm"
                          variant={row.getValue("job_id") == currentJobId ? "default" : "secondary"}
                          className="h-8 text-xs gap-2 group/btn"
                          onClick={() => switchAtomspace(row.getValue("job_id"), true)}
                        >
                          <BrainCircuit size={14} className="group-hover/btn:rotate-12 transition-transform text-primary-foreground/80" />
                          Mine Pattern
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
            : (
              <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-border/30 rounded-2xl bg-secondary/5">
                <div className="p-4 bg-secondary/10 rounded-full mb-4">
                  <Database size={48} className="text-muted-foreground/50" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Library Empty</h3>
                <p className="text-muted-foreground mb-6 text-center max-w-sm">
                  Import your data to start investigating patterns and running annotations.
                </p>
                <Button onClick={() => navigate("/import")} className="gap-2" size="lg">
                  <ArrowRight size={18} /> Get Started
                </Button>
              </div>
            )}
        </div>
      </div>
      <MinimalDataTablePagination table={table} />
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [{ title: "Generic annotation - Settings" }];
};

export function ErrorBoundary() {
  return <ErrorBoundaryContent />;
}
