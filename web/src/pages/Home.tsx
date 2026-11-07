import { MessageSquare } from 'lucide-react'

export function Home() {
  return (
    <div className="empty">
      <MessageSquare size={30} strokeWidth={1.5} />
      <h2>대화를 골라 주세요</h2>
      <p>왼쪽 목록에서 대화를 열거나, 새 채팅으로 시작해 보세요.</p>
    </div>
  )
}
