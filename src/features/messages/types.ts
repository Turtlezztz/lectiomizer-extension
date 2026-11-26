// Shapes of readMessages() output (src/lib/lectio/readers/messages.js, thread.js,
// compose.js). Elements are handles for postbacks, never for rendering.

export interface Folder {
  id: string;
  depth: number;
  label: string;
  title: string;
  source: Element | null;
  toggle: Element | null;
  open: boolean;
  current: boolean;
}

export interface MessageRow {
  subject: string;
  open: Element | null;
  sender: string;
  senderTitle: string;
  starter: string;
  recipients: string;
  recipientsTitle: string;
  changed: string;
  unread: boolean;
  flagged: boolean;
  attachment: boolean;
  select: HTMLInputElement | null;
  flag: Element | null;
  read: Element | null;
  hide: Element | null;
}

export interface ListActions {
  compose: Element | null;
  markAllRead: Element | null;
  toggleDeleted: Element | null;
  bulk: HTMLSelectElement | null;
  search: HTMLInputElement | null;
  searchButton: Element | null;
}

export interface Person {
  id: string;
  full: string;
  name: string;
  own?: boolean;
}

export interface Me {
  ids: string[];
  name: string;
  photo: string | null;
}

export interface MenuItem {
  label: string;
  icon: string;
  source: Element;
}

export interface Attachment {
  name: string;
  href: string;
  size: string;
}

export interface DraftFile {
  name: string;
  href: string | null;
  remove: Element | null;
}

export interface ThreadMessage {
  sender: Person;
  own: boolean;
  date: Date | null;
  stamp: string;
  title: string;
  content: Element | null;
  attachments: Attachment[];
  actions: MenuItem[];
}

export interface ReplyForm {
  body: HTMLTextAreaElement;
  send: Element;
  title: HTMLInputElement | null;
  cancel: Element | null;
  attach: Element | null;
  files: DraftFile[];
}

export interface Thread {
  subject: string;
  me: Me;
  recipients: Person[];
  messages: ThreadMessage[];
  reply: ReplyForm | null;
  back: string;
  base: string | null;
  recipientsText: string;
  actions: {
    reply: Element | null;
    flag: Element | null;
    flagged: boolean;
    menu: MenuItem[];
  };
}

export interface ComposeRecipient extends Person {
  remove: Element | null;
}

export interface Compose {
  me: Me;
  recipients: ComposeRecipient[];
  search: { input: HTMLInputElement; id: HTMLInputElement; add: Element };
  sources: Array<{ kind: string; url: string }>;
  subject: HTMLInputElement;
  body: HTMLTextAreaElement;
  send: Element;
  cancel: Element | null;
  attach: Element | null;
  files: DraftFile[];
  noReply: { input: HTMLInputElement; label: string } | null;
  errors: string[];
  back: string;
  base: string | null;
}

/** One reader for the whole page: the list, an open thread, or a new message. */
export interface MessagesData {
  folders: Folder[];
  folder?: string;
  actions?: ListActions;
  bulkOptions?: Array<{ value: string; label: string }>;
  searchValue?: string;
  messages?: MessageRow[];
  thread?: Thread;
  compose?: Compose;
}

export interface Recipient {
  key: string;
  title: string;
  kind: string;
  search: string;
}
