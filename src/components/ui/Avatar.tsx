import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  fallback: string
}

export function Avatar({ src, alt, fallback, className, ...props }: AvatarProps) {
  const [error, setError] = React.useState(false)

  return (
    <div
      className={cn(
        'relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted font-medium text-xs items-center justify-center text-muted-foreground select-none',
        className
      )}
      {...props}
    >
      {src && !error ? (
        <img
          src={src}
          alt={alt || fallback}
          onError={() => setError(true)}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <span className="font-semibold uppercase tracking-wider">{fallback}</span>
      )}
    </div>
  )
}
