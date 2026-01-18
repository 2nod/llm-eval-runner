import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";

interface RouterContext {
  queryClient: unknown;
}

const RootComponent = () => (
  <div className="min-h-screen bg-background">
    <header className="border-b">
      <div className="container mx-auto px-4">
        <nav className="flex h-14 items-center gap-6">
          <Link to="/" className="font-semibold">
            LLM Eval Runner
          </Link>
          <div className="flex gap-4 text-sm">
            <Link
              to="/scenes"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
            >
              Scenes
            </Link>
            <Link
              to="/experiments"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
            >
              Experiments
            </Link>
            <Link
              to="/stats"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
            >
              Stats
            </Link>
          </div>
        </nav>
      </div>
    </header>
    <main className="container mx-auto px-4 py-6">
      <Outlet />
    </main>
  </div>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});
