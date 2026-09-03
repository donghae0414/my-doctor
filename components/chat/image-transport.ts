import type { PrepareSendMessagesRequest, UIMessage } from "ai"

import {
  IMAGE_REQUEST_BYTE_LIMIT,
  ImageRequestBudgetError,
  omitPriorTurnImageBytes,
} from "@/lib/images/request-budget"

export const prepareSendMessagesRequest: PrepareSendMessagesRequest<UIMessage> = async (
  options,
) => {
  const body = {
    ...options.body,
    id: options.id,
    messageId: options.messageId,
    messages: omitPriorTurnImageBytes(options.messages),
    trigger: options.trigger,
  }
  const byteLength = new TextEncoder().encode(JSON.stringify(body)).byteLength
  if (byteLength > IMAGE_REQUEST_BYTE_LIMIT) throw new ImageRequestBudgetError()

  return {
    api: options.api,
    body,
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  }
}
