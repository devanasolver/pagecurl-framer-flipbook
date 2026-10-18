import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import framer from "vite-plugin-framer"

export default defineConfig({
    plugins: [react(), framer()],
    build: { target: "es2020" },
})
