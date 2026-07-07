import type { MessageRequest, MessageResponse } from "./types";

export async function sendMessage<T>(request: MessageRequest): Promise<T> {
  const response = (await browser.runtime.sendMessage(request)) as MessageResponse<T>;

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}
