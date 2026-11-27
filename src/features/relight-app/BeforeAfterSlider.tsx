import * as React from 'react'
import { ArrowLeftRight } from 'lucide-react'

interface BeforeAfterSliderProps {
  beforeSrc: string
  afterSrc: string
  beforeLabel?: string
  afterLabel?: string
  position?: number
  onPositionChange?: (next: number) => void
  blendOpacity?: number
  interactiveCard?: boolean
  objectFit?: 'cover' | 'contain'
  className?: string
  ariaLabel?: string
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
  position,
  onPositionChange,
  blendOpacity = 1,
  interactiveCard = false,
  objectFit = 'cover',
  className = '',
  ariaLabel = 'Bandingkan foto sebelum dan sesudah relight',
}: BeforeAfterSliderProps) {
  const [internalPos, setInternalPos] = React.useState(position ?? 52)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const draggingPointerId = React.useRef<number | null>(null)

  const currentPos = position !== undefined ? position : internalPos

  const updatePosition = React.useCallback(
    (next: number) => {
      const clamped = Math.round(Math.min(100, Math.max(0, next)))
      if (onPositionChange) {
        onPositionChange(clamped)
      } else {
        setInternalPos(clamped)
      }
    },
    [onPositionChange]
  )

  const updateFromClientX = React.useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      const pct = ((clientX - rect.left) / rect.width) * 100
      updatePosition(pct)
    },
    [updatePosition]
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (interactiveCard) {
      event.stopPropagation()
    }
    draggingPointerId.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromClientX(event.clientX)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== event.pointerId) return
    if (interactiveCard) {
      event.stopPropagation()
    }
    updateFromClientX(event.clientX)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== event.pointerId) return
    if (interactiveCard) {
      event.stopPropagation()
    }
    draggingPointerId.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 3
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      updatePosition(currentPos - step)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      updatePosition(currentPos + step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      updatePosition(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      updatePosition(100)
    }
  }

  const fitClass = objectFit === 'contain' ? 'is-contain' : 'is-cover'

  return (
    <div
      ref={containerRef}
      className={`rs-compare ${fitClass} ${className}`.trim()}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={currentPos}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(e) => {
        if (interactiveCard) e.stopPropagation()
      }}
      onKeyDown={handleKeyDown}
    >
      <img src={beforeSrc} alt={beforeLabel} className="rs-compare-img" draggable={false} />
      <img
        src={afterSrc}
        alt={afterLabel}
        className="rs-compare-img rs-compare-after"
        draggable={false}
        style={{
          opacity: blendOpacity,
          clipPath: `inset(0 ${100 - currentPos}% 0 0)`,
        }}
      />

      <span className="rs-compare-tag is-after">{afterLabel}</span>
      <span className="rs-compare-tag is-before">{beforeLabel}</span>

      <div className="rs-compare-divider" style={{ left: `${currentPos}%` }} aria-hidden="true">
        <span className="rs-compare-knob">
          <ArrowLeftRight size={14} />
        </span>
      </div>
    </div>
  )
}
