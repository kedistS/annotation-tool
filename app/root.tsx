import {
  json,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
  useNavigation,
} from "@remix-run/react";
import {
  CircleGauge,
  CloudUpload,
  Gem,
  Moon,
  Settings,
  Shapes,
  Sun,
  Pickaxe,
} from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import RelativeTime from "dayjs/plugin/relativeTime";
import {
  PreventFlashOnWrongTheme,
  Theme,
  ThemeProvider,
  useTheme,
} from "remix-themes";
import { themeSessionResolver } from "./theme.server";
import { LoaderFunctionArgs } from "@remix-run/node";
import dayjs from "dayjs";
import clsx from "clsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";
import {
  generateNodeStyle,
  QueryBuilderContext,
} from "@yisehak-awm/query-builder";
import { Button } from "./components/ui/button";
import { loaderAPI } from "./api";
import ErrorBoundaryContent from "./components/error-boundary";
import "./style.css";

dayjs.extend(RelativeTime);

export async function loader({ request }: LoaderFunctionArgs) {
  let schema;
  try {
    schema = (await loaderAPI.get("api/schema", {})).data;
  } catch (e) {
    console.error("ERROR", e);
    schema = {};
  }
  const { getTheme } = await themeSessionResolver(request);

  // Prepare environment variables for the client (window.ENV)
  // We prefer PUBLIC_ variables if they exist (typically for external/localhost access),
  // falling back to standard variables (internal/docker access) if not.
  const API_URL = process.env.PUBLIC_API_URL || process.env.API_URL || "";
  const ANNOTATION_URL = process.env.PUBLIC_ANNOTATION_URL || process.env.ANNOTATION_URL || "";
  const LOADER_URL = process.env.PUBLIC_LOADER_URL || process.env.LOADER_URL || "";
  const INTEGRATION_URL = process.env.PUBLIC_INTEGRATION_URL || process.env.INTEGRATION_URL || "http://localhost:9000";

  return json({
    ENV: { API_URL, ANNOTATION_URL, LOADER_URL, INTEGRATION_URL },
    theme: getTheme(),
    schema,
  });
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useTheme();
  const data: any = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const location = useLocation();

  const c = ({
    isActive,
    isPending,
  }: {
    isActive: boolean;
    isPending: boolean;
  }) => {
    if (isPending)
      return "mb-2 block rounded-lg bg-background p-2 text-foreground outline";
    if (isActive)
      return "mb-2 block rounded-lg bg-foreground p-2 text-background";
    return "mb-2 block rounded-lg p-2 text-foreground/50";
  };

  return (
    <html lang="en" className={clsx(theme)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="w-screen h-screen">
        {navigation.state === "loading" && (
          <div className="glowing navigation-indicator absolute left-0 top-0 h-1 w-4/5 bg-linear-to-r from-purple-500 to-cyan-500"></div>
        )}
        <div className="flex h-full w-full">
          <div className="p-4 bg-background border-e min-w-fit flex flex-col justify-between items-center">
            <ul>
              <li>
                <NavLink to="/" className={c}>
                  <Tooltip>
                    <TooltipTrigger className="p-0" asChild>
                      <CircleGauge size={24} />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      Dashboard
                    </TooltipContent>
                  </Tooltip>
                </NavLink>
              </li>
              <li>
                <NavLink to="/annotations" className={c}>
                  <Tooltip>
                    <TooltipTrigger className="p-0" asChild>
                      <Gem size={24} />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      Annotations
                    </TooltipContent>
                  </Tooltip>
                </NavLink>
              </li>
              <li>
                <NavLink to="/query" className={c}>
                  <Tooltip>
                    <TooltipTrigger className="p-0" asChild>
                      <Shapes size={24} />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      Query builder
                    </TooltipContent>
                  </Tooltip>
                </NavLink>
              </li>
              <li>
                <NavLink to="/import" className={c}>
                  <Tooltip>
                    <TooltipTrigger className="p-0" asChild>
                      <CloudUpload size={24} />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      Data import
                    </TooltipContent>
                  </Tooltip>
                </NavLink>
              </li>
              <li>
                <NavLink to="/mine" className={c}>
                  <Tooltip>
                    <TooltipTrigger className="p-0" asChild>
                      <Pickaxe size={24} />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      Mine Patterns
                    </TooltipContent>
                  </Tooltip>
                </NavLink>
              </li>
              <li className="mt-auto">
                <NavLink to="/settings" className={c}>
                  <Tooltip>
                    <TooltipTrigger className="p-0" asChild>
                      <Settings size={24} />
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      Settings
                    </TooltipContent>
                  </Tooltip>
                </NavLink>
              </li>
            </ul>
            <Button
              size="icon"
              variant="ghost"
              title="Toggle theme"
              className="mb-2 text-foreground/30 [&_svg]:size-6"
              onClick={() =>
                setTheme((t) => (t === Theme.DARK ? Theme.LIGHT : Theme.DARK))
              }
            >
              {theme === Theme.DARK ? <Sun /> : <Moon />}
            </Button>
          </div>
          <div className="relative flex-grow overflow-y-auto" key={location.pathname + location.search}>
            <QueryBuilderContext.Provider
              value={{
                nodeDefinitions:
                  data?.schema?.nodes?.map((n: any) => ({
                    ...n,
                    id: n.name,
                  })) || [],
                edgeDefinitions: data?.schema?.edges || [],
                style: data?.schema?.nodes
                  ? generateNodeStyle(data?.schema?.nodes, true)
                  : {},
                forms: data?.schema?.nodes
                  ? data.schema.nodes.reduce((acc: any, n: any) => {
                    return { ...acc, [n.name]: n.inputs };
                  }, {})
                  : {},
              }}
            >
              {children}
            </QueryBuilderContext.Provider>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(data?.ENV)}`,
          }}
        />
        <PreventFlashOnWrongTheme ssrTheme={Boolean(data.theme)} />
        <ScrollRestoration />
        <Scripts />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data: any = useLoaderData<typeof loader>();

  return (
    <ThemeProvider specifiedTheme={data?.theme} themeAction="/action/set-theme">
      <LayoutContent>{children}</LayoutContent>
    </ThemeProvider>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return <ErrorBoundaryContent />;
}
