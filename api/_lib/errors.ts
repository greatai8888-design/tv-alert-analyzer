import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface ApiError {
  error: string
  code: string
  details?: unknown
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code: string) {
    super(message)
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<VercelResponse | void>

export function withErrorHandler(handler: Handler): Handler {
  return async (req, res) => {
    try {
      return await handler(req, res)
    } catch (err: any) {
      if (err instanceof HttpError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code })
      }
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
      }))
      return res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      } satisfies ApiError)
    }
  }
}
