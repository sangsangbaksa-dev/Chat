export type ConvType = 'dm' | 'group' | 'space'

export interface Conversation {
  id: string
  type: ConvType
  name: string | null
  title: string
  avatar_url: string | null
  peer_id: string | null
  is_public: boolean
  last_message_at: string | null
  last_message_preview: string | null
  last_read_at: string
  unread_count: number
  member_count: number
  created_at: string
}

export interface Reaction {
  emoji: string
  user_id: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  reply_to: string | null
  attachment_path: string | null
  attachment_name: string | null
  attachment_type: string | null
  attachment_size: number | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  reactions: Reaction[]
  reply: { id: string; sender_id: string; body: string; deleted_at: string | null; attachment_path: string | null } | null
  pending?: boolean
  failed?: boolean
}

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
}
