import './style.css'
import { App } from './App/App'

const canvas = document.querySelector<HTMLCanvasElement>('.experience')

if (!canvas) {
  throw new Error('Canvas not found')
}

const app = new App(canvas)

void app.init().catch((error: unknown) => {
  console.error(error)
  document.documentElement.dataset.state = 'error'
})
