import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { LanguageSwitcher } from "../components/LanguageSwitcher"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Electron App" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootLayout,
})

function RootLayout() {
  return (
    <>
      <HeadContent />
      <div className="flex items-center justify-end gap-4 border-b border-gray-200 p-4 dark:border-gray-700">
        <LanguageSwitcher />
      </div>
      <Outlet />
      <TanStackDevtools
        config={{ position: "bottom-right" }}
        plugins={[{ name: "Tanstack Router", render: () => <TanStackRouterDevtoolsPanel /> }]}
      />
      <Scripts />
    </>
  )
}