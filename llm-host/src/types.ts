/** A file attached to a user message. */
export interface Attachment {
  name: string;
  path: string;
  size: number;
  mimeType?: string;
}
