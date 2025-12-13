import { type MetaFunction } from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
import {
  Context,
  CSVuploader,
  DataSource,
  DatasourceList,
  EntityData,
  RelationData,
  Schema,
  SchemaBuilder,
} from "@yisehak-awm/schema-builder";
import { Play, Sparkles } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";
import { loaderAPI, integrationAPI } from "~/api";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import useConfirm from "~/components/useConfirm";
import ErrorBoundaryContent from "~/components/error-boundary";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface Config {
  vertices: {
    label: string;
    input: {
      type: string;
      path: string;
      format: "CSV";
    };
    null_values: string[];
    id: string;
    selected: string[];
    field_mapping?: { [key: string]: string };
  }[];
  edges: {
    label: string;
    source: [string];
    target: [string];
    input: {
      type: string;
      path: string;
      format: string;
    };
    selected: string[];
    field_mapping?: { [key: string]: string };
  }[];
}

interface OutputSchema {
  property_keys: { name: string; type: string }[];
  vertex_labels: {
    name: string;
    properties: string[];
    nullable_keys: string[];
    id_strategy: "customize_string";
  }[];
  edge_labels: {
    name: string;
    source_label: string;
    target_label: string;
    properties: string[];
  }[];
}

function Tool() {
  const { dataSources, setDataSources, isValid, schema } = useContext(Context);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [writer, setWriter] = useState<"metta" | "neo4j" | "mork" | "networkx">(
    "metta"
  );
  const [graphType, setGraphType] = useState<"directed" | "undirected">("directed");
  const [initialSchema, setInitialSchema] = useState<Schema | undefined>();

  function removeSource(id: string) {
    setDataSources((ss: DataSource[]) => ss.filter((s) => s.id !== id));
  }

  async function runImport() {
    if (!schema?.nodes) throw "Invalid schema";

    const vertices: Config["vertices"] = [];
    const edges: Config["edges"] = [];
    const property_keys: OutputSchema["property_keys"] = [];
    const vertex_labels: OutputSchema["vertex_labels"] = [];
    const edge_labels: OutputSchema["edge_labels"] = [];

    const map: { [key: string]: string } = {};

    schema.nodes.map((n) => {
      const data = n.data as EntityData;
      const entityProps = Object.values(data.properties).filter(
        (p) => p.checked
      );

      entityProps.map((p) => {
        if (map[p.name || p.col] == "text") return;
        map[p.name || p.col] = p.type;
      });

      const fieldMapping = entityProps.reduce((a, c) => {
        return c.name ? { ...a, [c.col]: c.name } : a;
      }, {});

      vertices.push({
        label: data.name!,
        input: {
          type: "file",
          path: dataSources.find((d) => d.id == data.table)?.file.name!,
          format: "CSV",
        },
        id: data.properties[data.primaryKey!].col,
        selected: entityProps.map((p) => p.col),
        null_values: ["NULL", "null", ""],
        field_mapping: fieldMapping,
      });

      vertex_labels.push({
        name: data.name!,
        properties: entityProps
          .map((p) => p.name || p.col)
          .filter((p) => p !== "id"),
        nullable_keys: entityProps
          .map((p) => p.name || p.col)
          .filter((p) => p !== data.primaryKey),
        id_strategy: "customize_string",
      });
    });

    schema.edges.map((e) => {
      const data = e.data as RelationData;
      const connections = Object.values(data);

      connections.map((c) => {
        const sourceEntity = schema.nodes.find((n) =>
          c.reversed ? n.id == e.target : n.id == e.source
        )?.data as EntityData;

        const targetEntity = schema.nodes.find((n) =>
          c.reversed ? n.id == e.source : n.id == e.target
        )?.data as EntityData;

        const relationProps = Object.values(c.properties).filter(
          (p) => p.checked
        );

        relationProps.map((p) => {
          if (map[p.name || p.col] == "text") return;
          map[p.name || p.col] = p.type;
        });

        const fieldMapping = relationProps.reduce((a, c) => {
          return c.name ? { ...a, [c.col]: c.name } : a;
        }, {});

        edges.push({
          label: c.name!,
          source: [c.source!],
          target: [c.target!],
          input: {
            type: "file",
            path: dataSources.find((d) => d.id == c.table)?.file.name!,
            format: "CSV",
          },
          selected: relationProps.map((p) => p.col),
          field_mapping: fieldMapping,
        });

        edge_labels.push({
          name: c.name!,
          source_label: sourceEntity.name as string,
          target_label: targetEntity.name as string,
          properties: relationProps
            .filter((p) => p.col !== "id")
            .map((p) => p.name || p.col),
        });
      });
    });

    property_keys.push(
      ...Object.entries(map).map((e) => ({ name: e[0], type: e[1] }))
    );

    const config: Config = { vertices, edges };
    const outputSchema: OutputSchema = {
      vertex_labels,
      edge_labels,
      property_keys,
    };

    const formData = new FormData();
    for (const source of dataSources) {
      formData.append("files", source.file);
    }
    formData.append("config", JSON.stringify(config));
    formData.append("schema_json", JSON.stringify(outputSchema));
    formData.append("writer_type", writer);

    try {
      setBusy(true);

      if (writer === "networkx") {
        // NetworkX Submission
        const networkXFormData = new FormData();
        for (const source of dataSources) {
          networkXFormData.append("files", source.file);
        }
        networkXFormData.append("config", JSON.stringify(config));
        networkXFormData.append("schema_json", JSON.stringify(outputSchema));
        networkXFormData.append("writer_type", writer);
        networkXFormData.append("graph_type", graphType);

        const response = await integrationAPI.post("/api/generate-graph", networkXFormData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const jobId = response.data.job_id;
        toast.success("NetworkX Graph Generated!", {
          description: (
            <div className="flex flex-col gap-2">
              <p>Job ID: {jobId}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(jobId);
                  toast.success("Copied to clipboard!");
                }}
              >
                Copy Job ID
              </Button>
            </div>
          ),
          duration: 5000,
        });

        // Delay redirect slightly to allow user to see/copy, or rely on them seeing it on dashboard?
        // User asked for copy "before it redirect" or "popup... then show job id".
        // A Toast with a button is good.
        // Let's create a small delay or just redirect. The user said "before it redirect there is a popup".
        // The toast will persist for a bit or until clicked if we configure it?
        // Actually, if we redirect, the toast might survive if it conflicts with navigation.
        // But usually, navigating refreshes the page or unmounts components.
        // This is Remix. Navigation to `/?job_id=...` might re-render.
        // Let's use `navigate` instead of `window.location.href` to be SPA-friendly and keep the toast alive.

        setTimeout(() => {
          // Redirect to dashboard with Job ID
          navigate(`/?job_id=${jobId}&writer=networkx`);
        }, 2000);
        return;
      }

      // Default Loader Submission
      await loaderAPI.post("api/load", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Data has been imported successfully!", {
        description: "You may now build queries and run annotations.",
      });
      navigate("/");
    } catch (e) {
      console.error(e);
      toast.error("Could not import data", {
        description:
          "Something is wrong with the schema construction or the files could not be uploaded",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full w-full flex">
      <div className="absolute top-6 right-6 z-50">
        <div className="relative  p-[1px]">
          {dataSources.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-lg bg-[conic-gradient(from_0deg,_cyan,_violet,_cyan)] pointer-events-none opacity-50"
            ></span>
          )}
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="outline"
                className="relative overflow-hidden border-0 hover:cursor-pointer hover:bg-background"
                disabled={dataSources.length < 1}
                onClick={useConfirm({
                  promise: () =>
                    loaderAPI
                      .post(
                        "api/suggest-schema",
                        {
                          dataSources: dataSources.map((d) => ({
                            ...d,
                            file: {
                              name: d.file.name,
                              size: d.file.size,
                              type: d.file.type,
                            },
                          })),
                        },
                        {}
                      )
                      .then((data) => {
                        setInitialSchema(data.data.schema);
                      }),
                  prompt: `This will replace the current schema with an Ai generated suggestion.`,
                  action: "Yes, suggest schema!",
                  loading: "Generating schema from data sources ...",
                  success: "Schema suggestion generated from data sources!",
                  error:
                    "Something went wrong while generating schema, please try again",
                  variant: "default",
                })}
              >
                <Sparkles className="inline" /> Suggest a schema
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {dataSources.length > 0 ? (
                <span>
                  Generate a schema taking into account the uploaded data
                  sources.
                </span>
              ) : (
                <span>Upload data sources first to generate a schema</span>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="border-e  relative h-full flex flex-col">
        <div className="px-4 mt-4">
          <div className="flex items-center">
            <div>
              <h4 className="font-bold ">Data import tool</h4>
              <p className="text-muted-foreground text-sm">
                Upload .csv data source files
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 my-2 flex flex-col items-center ">
          <CSVuploader />
        </div>
        <div className="grow overflow-auto">
          <DatasourceList dataSources={dataSources} onRemove={removeSource} />
        </div>
        <div className="w-full bottom-0 p-4 border-t border-dashed">
          <p className="text-sm font-bold mb-2">Writer type:</p>
          <RadioGroup
            className="px-2 mb-6 flex"
            defaultValue={writer}
            onValueChange={(v) => setWriter(v as typeof writer)}
          >
            <div className="flex items-center gap-3">
              <RadioGroupItem value="metta" id="metta" />
              <Label htmlFor="metta">Metta</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="neo4j" id="neo4j" />
              <Label htmlFor="neo4j">Neo4j</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="mork" id="mork" />
              <Label htmlFor="mork">Mork</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="networkx" id="networkx" />
              <Label htmlFor="networkx">NetworkX</Label>
            </div>
          </RadioGroup>

          {writer === "networkx" && (
            <>
              <p className="text-sm font-bold mb-2">Graph Type:</p>
              <RadioGroup
                className="px-2 mb-6 flex"
                defaultValue={graphType}
                onValueChange={(v) => setGraphType(v as typeof graphType)}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="directed" id="directed" />
                  <Label htmlFor="directed">Directed</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="undirected" id="undirected" />
                  <Label htmlFor="undirected">Undirected</Label>
                </div>
              </RadioGroup>
            </>
          )}

          <Button
            className="w-full shadow-lg"
            disabled={!isValid}
            busy={busy}
            onClick={runImport}
          >
            {!busy && <Play className="inline me-1" />} Run import
          </Button>
        </div>
      </div>
      <div className="relative w-full h-full">
        <SchemaBuilder
          initialNodes={initialSchema?.nodes}
          initialEdges={initialSchema?.edges}
        />
      </div>
    </div>
  );
}

export default function () {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isValid, setIsValid] = useState<boolean>(false);
  const [schema, setSchema] = useState<Schema>(null as any);

  return (
    <Context.Provider
      value={{
        dataSources,
        setDataSources,
        isValid,
        setIsValid,
        schema,
        setSchema,
      }}
    >
      <Tool />
    </Context.Provider>
  );
}

export const meta: MetaFunction = () => {
  return [{ title: "Generic annotation - Data importer" }];
};

export function ErrorBoundary() {
  return <ErrorBoundaryContent />;
}
