import { useState } from "react"
import { useTranslation } from "react-i18next"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { initORPC } from "@/lib/orpc"

export const Route = createFileRoute("/")({ component: App })

function App() {
  const { t } = useTranslation()
  const [pingResult, setPingResult] = useState<string>("")
  const [userName, setUserName] = useState<string>("")
  const [clientReady, setClientReady] = useState(false)

  const ensureClient = async () => {
    if (!clientReady) {
      await initORPC()
      setClientReady(true)
    }
  }

  const testPing = async () => {
    try {
      await ensureClient()
      const client = await initORPC()
      const result = await client.ping({ message: "hello" })
      setPingResult(String(result))
    } catch (err) {
      setPingResult(`Error: ${err}`)
    }
  }

  const createUser = async () => {
    try {
      await ensureClient()
      const client = await initORPC()
      const result = await client.createUser({ name: userName, email: `${userName.toLowerCase()}@test.com` })
      setPingResult(`Created user: ${JSON.stringify(result)}`)
    } catch (err) {
      setPingResult(`Error: ${err}`)
    }
  }

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium text-lg">{t("app.title")}</h1>
          <p>{t("app.description")}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={testPing}>{t("common.test")}</Button>
        </div>

        <div>
          <pre className="mt-2 rounded bg-muted p-2">{pingResult || t("common.clickToTest")}</pre>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder={t("users.name")}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
          <Button onClick={createUser}>{t("users.createUser")}</Button>
        </div>
      </div>
    </div>
  )
}