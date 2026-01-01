import { computePosition, flip, shift, limitShift } from "@floating-ui/dom";
import {
  Camera,
  Download,
  Maximize,
  Minus,
  Plus,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { ReferenceElement } from "@floating-ui/core";
import {
  useEffect,
  useRef,
  useState,
  useContext,
  useMemo,
  useCallback,
} from "react";
import { Button } from "./ui/button";
import cytoscapePopper from "cytoscape-popper";
import html2canvas from "html2canvas-pro";
import dagre from "cytoscape-dagre";
import saver from "file-saver";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import cytoscape, {
  CytoscapeOptions,
  EdgeSingular,
  ElementDefinition,
  ElementsDefinition,
  NodeSingular,
  StylesheetCSS,
} from "cytoscape";
import { Theme, useTheme } from "remix-themes";
import colors from "tailwindcss/colors";
import { ColumnDef, flexRender, Table } from "@tanstack/react-table";
import { useDataTable, DataTableColumnHeader } from "./data-table";
import { Input } from "./ui/input";
import { convert } from "colorizr";
import { Annotation } from "../routes/annotations";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Skeleton } from "./ui/skeleton";

cytoscape.use(dagre);
cytoscape.use(cytoscapePopper(popperFactory));

type Element = NodeSingular | EdgeSingular;

interface PopperInstance {
  update: () => void;
}

interface BaseCytoscapeGraphProps extends CytoscapeOptions {
  elements: ElementsDefinition;
  filters?: string[];
  style?: any[];
  children?: React.ReactNode;
  colorMapping: any;
  onRender?: (graph: cytoscape.Core) => void;
  NodePopup?: React.FC<{
    popupRef: React.RefObject<HTMLDivElement>;
    selectedNode: NodeSingular | EdgeSingular;
  }>;
  hideControls?: boolean;
}

export default function Graph(props: BaseCytoscapeGraphProps) {
  const { elements, onRender, NodePopup, ...other } = props;
  const graph = useRef<cytoscape.Core>();
  const popperRef = useRef<PopperInstance>();
  const popup = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<any>();
  const updatePopupPosition = () => popperRef.current?.update();
  const selectNode = (e: any) => setSelectedNode(e.target);
  const unselectNode = () => setSelectedNode(undefined);
  const [theme] = useTheme();

  const style: any[] = useMemo(() => {
    const bg = convert(colors.slate[950], "hex");
    const gray = convert(colors.slate[theme == Theme.DARK ? 600 : 300], "hex");

    return [
      {
        selector: "node",
        style: {
          "text-wrap": "wrap",
          "text-max-width": "400px",
          "font-family": "monospace",
          "min-zoomed-font-size": 4,
          color: theme == Theme.DARK ? "white" : "black",
          label: (e: any) => {
            const data = e.data();
            return data.name || data.id;
          },
        },
      },
      {
        selector: "edge",
        style: {
          "arrow-scale": 2,
          label: "data(label)",
          "curve-style": "bezier",
          "text-outline-width": 5,
          "min-zoomed-font-size": 4,
          "font-family": "monospace",
          "target-arrow-shape": "chevron",
          "text-outline-color": theme == Theme.DARK ? bg : "white",
          "line-color": gray,
          "target-arrow-color": gray,
          color: theme == Theme.DARK ? "white" : "black",
        },
      },
      ...Object.keys(props.colorMapping || {}).map((k) => ({
        selector: `node[type="${k}"],node[id="${k}"]`,
        style: {
          "background-opacity": 0.7,
          "background-color": (props.colorMapping as any)[k],
          color: theme == Theme.DARK ? colors.white : colors.black,
        },
      })),
      {
        selector: 'node[type="parent"]',
        style: {
          label: "",
          "border-width": 3,
          "background-opacity": 0,
          "border-style": "dashed",
          "border-color": gray,
          opacity: 1,
        },
      },
      {
        selector: ".hidden",
        css: {
          display: "none",
        },
      },
    ];
  }, [theme, props.colorMapping]);

  useEffect(() => {
    graph.current = cytoscape({
      container: container.current,
      style,
      elements,
      layout,
      ...other,
    });
    graph.current.elements().on("select", selectNode);
    graph.current.elements().on("unselect", unselectNode);
    graph.current.elements().on("position", updatePopupPosition);
    graph.current.on("pan zoom resize", updatePopupPosition);
    graph.current.on("ready", fitToView);
    onRender?.(graph.current);
  }, [elements]);

  useEffect(() => {
    if (style) graph.current?.style(style).update();
  }, [style]);

  useEffect(() => {
    applyFilters();
  }, [props.filters]);

  useEffect(() => {
    updatePopup();
  }, [selectedNode]);

  function fitToView() {
    graph.current?.fit(graph.current.elements(), 100);
  }

  function applyFilters() {
    graph.current?.elements().removeClass("hidden");
    const selector = props.filters
      ?.map((term) => `[type="${term}"], [label="${term}"]`)
      .join(", ");
    if (selector) graph.current?.elements(selector).addClass("hidden");
  }

  function updatePopup() {
    if (selectedNode) {
      popperRef.current = (selectedNode as any).popper({
        content: popup.current!,
      }) as PopperInstance;
      popperRef.current.update();
    }
  }

  function zoomIn() {
    const currentZoom = graph.current?.zoom()!;
    graph.current?.zoom(currentZoom + 0.1);
  }

  function zoomOut() {
    const currentZoom = graph.current?.zoom()!;
    graph.current?.zoom(currentZoom - 0.1);
  }

  function exportImage() {
    html2canvas(container.current!).then((canvas) => {
      saver(canvas.toDataURL(), "graph-image.jpeg");
    });
  }

  function dowloadGraphJSON() {
    var jsonBlob = new Blob([JSON.stringify(graph.current?.json())], {
      type: "application/javascript;charset=utf-8",
    });
    saver(jsonBlob, "graph-data.json");
  }

  const Popup = NodePopup || ContextMenu;

  return (
    <>
      <div ref={container} className="h-full w-full dotted-bg"></div>
      <Popup popupRef={popup} selectedNode={selectedNode} />
      {!props.hideControls && (
        <div className="absolute bottom-6 left-12 flex items-end">
          <div className="me-4 flex flex-col rounded-full border bg-background/60 p-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="link" onClick={zoomIn}>
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="link" onClick={fitToView}>
                  <Maximize className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="link" onClick={zoomOut}>
                  <Minus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex rounded-full border bg-background/60 p-1 px-6">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="me-2"
                  size="icon"
                  variant="link"
                  onClick={exportImage}
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save graph as image</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="link" onClick={dowloadGraphJSON}>
                  <Download className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save graph JSON</TooltipContent>
            </Tooltip>
          </div>
          {props.children}
        </div>
      )}
    </>
  );
}

const layout = {
  name: "dagre",
  nodeDimensionsIncludeLabels: true,
  rankSep: 300,
  edgeSep: 100,
  rankDir: "LR",
  elk: {
    algorithm: "layered",
    "spacing.nodeNodeBetweenLayers": 200,
    "spacing.nodeNode": 80,
  },
};

export function popperFactory(
  ref: ReferenceElement,
  content: any,
  opts: any
): PopperInstance {
  const popperOptions = {
    middleware: [flip(), shift({ limiter: limitShift() })],
    ...opts,
  };
  function update() {
    computePosition(ref, content, popperOptions).then(({ x, y }) => {
      Object.assign(content.style, {
        left: `${x}px`,
        top: `${y + 15}px`,
      });
    });
  }
  update();
  return { update };
}

const ContextMenu = ({
  popupRef,
  selectedNode,
}: {
  popupRef: React.RefObject<HTMLDivElement>;
  selectedNode: any;
}) => {
  const data = selectedNode?.data();

  if (!data || data.source) return <div ref={popupRef}></div>;

  const nodes = useMemo(
    () =>
      data.nodes?.map((n: any, i: number) => ({ serial: i + 1, ...n })) || [
        data,
      ],
    [data.nodes]
  );

  const columns: ColumnDef<any>[] = useMemo(() => {
    if (!data.nodes?.length) return [];
    return Object.keys(data.nodes[0])
      .filter((k) => k !== "type")
      .map((k) => ({
        id: k,
        accessorKey: k,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={k} />
        ),
      }));
  }, [selectedNode]);

  const table: Table<{ id: string }> = useDataTable(columns, nodes);

  return (
    <div
      ref={popupRef}
      className="absolute z-50 rounded-md bg-primary text-background/65"
    >
      {nodes.length > 1 && (
        <>
          <p className="m-2 mb-0 font-mono text-xs">{data.name || data.id}</p>
          <Input
            placeholder="Search ..."
            className="mb-1 border-0 focus:outline-none focus-visible:ring-0 dark:bg-background"
            value={(table.getState().globalFilter as string) ?? ""}
            onChange={(event) => {
              table.setGlobalFilter(event.target.value);
            }}
          />
        </>
      )}
      <table
        className={`w-full border-y text-left text-sm ${nodes.length == 1 && "mb-4"
          }`}
      >
        <thead className="border-y">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr>
              {headerGroup.headers.map((header) => (
                <th className="px-2" key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="hover:cursor-pointer hover:text-background"
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <td className="px-2" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={table.getAllColumns().length}
                className="h-24 text-center"
              >
                No results.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {nodes.length > 1 && (
        <div className="mx-2 flex items-center justify-between">
          <Button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ArrowLeft className="me-2 inline" /> Prev{" "}
          </Button>
          <p className="mx-2 text-sm">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </p>
          <Button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next <ArrowRight className="ms-2 inline" />
          </Button>
        </div>
      )}
    </div>
  );
};
