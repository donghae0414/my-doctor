"use client"

import { CameraIcon, ImageIcon } from "lucide-react"
import { useState } from "react"

import { Attachment, AttachmentEmpty, Attachments } from "@/components/ai-elements/attachments"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageStatus } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources"
import { Button } from "@/components/ui/button"

const previews = [
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='16' fill='%23e9dfd2'/%3E%3Ccircle cx='48' cy='42' r='18' fill='%23b86643'/%3E%3Cpath d='M22 78c8-18 44-18 52 0' fill='%235d5145'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='16' fill='%23dfd8cc'/%3E%3Cpath d='M22 68 42 36l12 18 10-12 12 26Z' fill='%23a95d3f'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='16' fill='%23eee7dc'/%3E%3Ccircle cx='48' cy='48' r='26' fill='%23c47b59'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' rx='16' fill='%23d9d0c3'/%3E%3Cpath d='M28 26h40v44H28z' fill='%237c6658'/%3E%3C/svg%3E",
] as const

type PreviewIndex = 0 | 1 | 2 | 3

function StateControls() {
  return (
    <section
      aria-labelledby="control-states"
      className="grid gap-3 rounded-xl bg-card p-4 shadow-sm"
    >
      <h2 className="m-0 text-lg font-semibold" id="control-states">
        조작 상태
      </h2>
      <div className="flex flex-wrap gap-2">
        <Button>기본</Button>
        <Button data-state="hover">호버</Button>
        <Button data-state="pressed">누름</Button>
        <Button autoFocus>키보드 초점</Button>
        <Button disabled>비활성</Button>
        <Button aria-busy="true">처리 중</Button>
        <Button variant="destructive">오류</Button>
      </div>
    </section>
  )
}

function ConversationShowcase() {
  return (
    <section aria-labelledby="conversation-states" className="grid min-h-0 gap-3">
      <h2 className="m-0 text-lg font-semibold" id="conversation-states">
        대화와 메시지
      </h2>
      <Conversation
        aria-label="상담 대화 미리보기"
        className="min-h-96 rounded-xl bg-background shadow-sm"
      >
        <ConversationContent>
          <ConversationEmptyState
            description={
              <>
                빈 상태에서도 <span data-semantic-phrase="질문과">질문과</span>{" "}
                <span data-semantic-phrase="안내는">안내는</span>{" "}
                <span data-semantic-phrase="항상">항상</span>{" "}
                <span data-semantic-phrase="접근할 수 있습니다.">접근할 수 있습니다.</span>
              </>
            }
          />
          <Message from="assistant">
            <MessageContent>
              아기가 잘 먹고 있지만 체온과{" "}
              <span data-semantic-phrase="소변 횟수도">소변 횟수도</span>{" "}
              <span data-semantic-phrase="함께 살펴보세요.">함께 살펴보세요.</span> 모두 확인해
              보세요.{" "}
              <span className="inline-block whitespace-nowrap" data-keep-phrase>
                산후 회복 중에는
              </span>{" "}
              갑자기 심해지는 두통이나 숨참이 있다면 바로 119에 연락해야 합니다.
            </MessageContent>
          </Message>
          <Message from="user">
            <MessageContent>생후 3주 아기가 수유 뒤에 자주 토해요.</MessageContent>
          </Message>
          <Message from="assistant">
            <MessageStatus>근거를 확인하고 있어요.</MessageStatus>
            <MessageStatus tone="error">
              답변을 불러오지 못했습니다. 질문 내용은 그대로{" "}
              <span data-semantic-phrase="남아 있습니다">남아 있습니다</span>.{" "}
              <span data-semantic-phrase="현재">현재</span> 상태가{" "}
              <span data-semantic-phrase="있습니다.">있습니다.</span>
            </MessageStatus>
          </Message>
          <Sources defaultOpen>
            <SourcesTrigger count={2} />
            <SourcesContent>
              <Source
                href="https://www.healthychildren.org/example"
                motionIndex={0}
                title="신생아 수유 뒤 게워냄과 체중 증가를 함께 살펴보는 보호자 안내"
              />
              <Source
                href="https://example.com/an-extremely-long-unbroken-source-address-for-overflow-testing"
                motionIndex={1}
                title="아주 긴 주소도 화면 바깥으로 밀어내지 않는 근거 자료"
              />
            </SourcesContent>
          </Sources>
        </ConversationContent>
      </Conversation>
    </section>
  )
}

function AttachmentShowcase() {
  const [visiblePreviews, setVisiblePreviews] = useState<readonly PreviewIndex[]>([0, 1, 2, 3])

  return (
    <section aria-labelledby="attachment-states" className="grid gap-3">
      <h2 className="m-0 text-lg font-semibold" id="attachment-states">
        첨부 이미지
      </h2>
      <Attachments data-testid="attachment-grid">
        {visiblePreviews.map((index, motionIndex) => (
          <Attachment
            alt={`상담 첨부 이미지 ${index + 1}`}
            key={previews[index]}
            motionIndex={motionIndex}
            name={`산후회복기록-${index + 1}.jpg`}
            onRemove={() =>
              setVisiblePreviews((current) => current.filter((item) => item !== index))
            }
            preview={previews[index]}
            status={index === 2 ? "loading" : index === 3 ? "error" : "ready"}
          />
        ))}
      </Attachments>
      <AttachmentEmpty>선택한 이미지가 없습니다.</AttachmentEmpty>
    </section>
  )
}

function ComposerShowcase() {
  return (
    <section aria-labelledby="composer-states" className="grid gap-3">
      <h2 className="m-0 text-lg font-semibold" id="composer-states">
        질문 입력
      </h2>
      <PromptInput onSubmit={() => undefined}>
        <PromptInputTextarea aria-label="의료 질문" placeholder="증상과 시점을 적어 주세요" />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton aria-label="카메라로 촬영">
              <CameraIcon aria-hidden="true" />
            </PromptInputButton>
            <PromptInputButton aria-label="사진 보관함에서 선택">
              <ImageIcon aria-hidden="true" />
            </PromptInputButton>
          </PromptInputTools>
          <div className="flex flex-wrap gap-2">
            <PromptInputSubmit status="disabled" />
            <PromptInputSubmit status="loading" />
            <PromptInputSubmit status="ready" />
            <PromptInputSubmit status="streaming" />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </section>
  )
}

export function PrimitiveShowcase() {
  return (
    <main
      className="min-h-[100dvh] overflow-x-clip bg-background p-4 text-foreground"
      data-testid="primitive-showcase"
    >
      <div className="mx-auto grid w-full max-w-5xl gap-8 py-4">
        <header className="grid max-w-[65ch] gap-2">
          <p className="m-0 text-sm font-medium text-foreground">
            개발 전용 구성 요소 검증: <span data-semantic-phrase="있습니다">있습니다</span>
          </p>
          <h1 className="m-0 text-3xl font-bold">
            <span className="inline-block whitespace-nowrap">의료 상담</span>{" "}
            <span className="inline-block whitespace-nowrap">기본 요소</span>
          </h1>
          <p className="m-0 break-keep text-base leading-6 text-muted-foreground">
            <span data-semantic-phrase="함께">함께</span> 긴 한국어 문장, 오류, 비어 있음, 로딩,
            초점과 비활성{" "}
            <span className="inline-block whitespace-nowrap" data-keep-phrase>
              상태를
            </span>{" "}
            한 화면에서 확인합니다.
          </p>
        </header>
        <StateControls />
        <ConversationShowcase />
        <AttachmentShowcase />
        <ComposerShowcase />
      </div>
    </main>
  )
}
