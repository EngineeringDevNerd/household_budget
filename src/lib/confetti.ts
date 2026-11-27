// A short burst of confetti over the whole screen, drawn on a temporary
// canvas and removed when it's done. Skipped when Reduce Motion is on.
const COLORS = ['#3655d6', '#5b7cff', '#109463', '#e0862f', '#c73fa8', '#d6a419', '#2f8fd8']

export function confetti() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  canvas.className = 'confetti'
  canvas.setAttribute('aria-hidden', 'true')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.remove()
  ctx.scale(dpr, dpr)

  const pieces = Array.from({ length: 110 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 60,
    y: h * 0.32,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 11 - 4,
    size: 5 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
  }))

  let frame = 0
  const tick = () => {
    ctx.clearRect(0, 0, w, h)
    const fade = Math.max(0, 1 - Math.max(0, frame - 70) / 50)
    for (const p of pieces) {
      p.vy += 0.3
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.angle += p.spin
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    if (++frame < 120) requestAnimationFrame(tick)
    else canvas.remove()
  }
  requestAnimationFrame(tick)
}
