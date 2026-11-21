import React, { useState, useRef, useEffect } from 'react';
import { Send, Shield, Loader2, Mic, Square, Paperclip, FileAudio } from 'lucide-react';
import { ModelOption, ChatMessage, DriveAudioFile } from '../types/index.ts';
import { AVAILABLE_MODELS, INITIAL_CHAT_MESSAGES } from '../data/mockData.ts';
import {
  createDriveAudioFile,
  createSyntheticMeetingWavUrl,
  parseTimestampToSeconds
} from '../utils/audioDrive.ts';
import { computeBoundedTimestamp } from '../utils/meetingNotes.ts';
import { InlineAudioPlayer, SeekRequest } from './InlineAudioPlayer.tsx';

interface OnDeviceChatProps {
  selectedModel?: ModelOption;
  offlineOnly?: boolean;
  onToggleOffline?: () => void;
  onSaveToDrive?: (file: DriveAudioFile) => void;
  embedded?: boolean;
}

function readAudioMeta(file: File): Promise<{ durationSec: number; url: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    let settled = false;
    const finish = (sec: number) => {
      if (settled) return;
      settled = true;
      resolve({ durationSec: sec > 0 ? sec : 90, url });
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(90);
    setTimeout(() => finish(90), 600);
    audio.src = url;
  });
}

export const OnDeviceChat: React.FC<OnDeviceChatProps> = ({
  selectedModel: controlledModel,
  offlineOnly,
  onToggleOffline,
  onSaveToDrive,
  embedded = false
}) => {
  const [internalModel] = useState<ModelOption>(AVAILABLE_MODELS[1]);
  const selectedModel = controlledModel || internalModel;

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [internalPrivacy, setInternalPrivacy] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [seekByMsgId, setSeekByMsgId] = useState<Record<string, SeekRequest>>({});
  const isPrivacyMode = offlineOnly !== undefined ? offlineOnly : internalPrivacy;

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(messages.length);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordStartRef = useRef<number>(0);

  useEffect(() => {
    const hasNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if ((hasNewMessage || isGenerating) && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  const quickPrompts = [
    'ClaimCenter FNOL to Reserve steps',
    'Cloud API vs Gosu Event Messaging',
    'PolicyCenter coverage snapshot sync',
    'SIU fraud scoring triggers'
  ];

  const appendAudioToChat = (driveFile: DriveAudioFile) => {
    onSaveToDrive?.(driveFile);
    const t1 = computeBoundedTimestamp(driveFile.durationSec, 0.2);
    const t2 = computeBoundedTimestamp(driveFile.durationSec, 0.65);

    const userAudioMsg: ChatMessage = {
      id: `aud-${Date.now()}`,
      role: 'user',
      content: `Attached audio · Saved to Settings → Drive`,
      timestamp: driveFile.createdAt,
      audioAttachment: {
        driveFileId: driveFile.id,
        fileName: driveFile.fileName,
        durationSec: driveFile.durationSec,
        durationLabel: driveFile.durationLabel,
        audioUrl: driveFile.audioUrl,
        highlights: [
          {
            timestamp: t1,
            speaker: 'Maya',
            text: 'FNOL composite API boundary and reserve pre-update check.'
          },
          {
            timestamp: t2,
            speaker: 'Alex',
            text: 'PolicyCenter coverage snapshot SLA and SIU score threshold.'
          }
        ]
      }
    };

    const replyMsg: ChatMessage = {
      id: `asst-${Date.now() + 1}`,
      role: 'assistant',
      content: `Indexed ${driveFile.fileName} (${driveFile.durationLabel}) inside this chat and saved it to Drive. Click any timestamp above to jump directly to that point in the audio.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      metadata: {
        tokensPerSec: selectedModel.tokensPerSec,
        ramMB: selectedModel.ramUsageMB,
        latencyMs: 140,
        isPrivate: isPrivacyMode
      }
    };

    setMessages(prev => [...prev, userAudioMsg, replyMsg]);
  };

  const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { durationSec, url } = await readAudioMeta(file);
    const driveFile = createDriveAudioFile({
      fileName: file.name,
      origin: 'imported',
      durationSec,
      sizeBytes: file.size || 180000,
      audioUrl: url,
      mimeType: file.type || 'audio/mpeg',
      linkedSessionTitle: 'Local Chat Audio'
    });
    appendAudioToChat(driveFile);
    e.target.value = '';
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      setIsRecording(false);
      const elapsed = Math.max(8, Math.round((Date.now() - recordStartRef.current) / 1000));
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        const url = createSyntheticMeetingWavUrl(elapsed, messages.length + 7);
        const driveFile = createDriveAudioFile({
          fileName: `chat_recording_${messages.length + 1}.wav`,
          origin: 'recorded',
          durationSec: elapsed,
          sizeBytes: 4000 * elapsed + 44,
          audioUrl: url,
          mimeType: 'audio/wav',
          linkedSessionTitle: 'Local Chat Audio'
        });
        appendAudioToChat(driveFile);
      }
      return;
    }

    recordStartRef.current = Date.now();
    setIsRecording(true);
    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const elapsed = Math.max(6, Math.round((Date.now() - recordStartRef.current) / 1000));
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const url = blob.size > 0 ? URL.createObjectURL(blob) : createSyntheticMeetingWavUrl(elapsed, 4);
          const driveFile = createDriveAudioFile({
            fileName: `chat_recording_${messages.length + 1}.webm`,
            origin: 'recorded',
            durationSec: elapsed,
            sizeBytes: blob.size || 4000 * elapsed,
            audioUrl: url,
            mimeType: blob.type || 'audio/webm',
            linkedSessionTitle: 'Local Chat Audio'
          });
          appendAudioToChat(driveFile);
          mediaRecorderRef.current = null;
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
      }
    } catch {
      mediaRecorderRef.current = null;
    }
  };

  const handleJumpTimestamp = (msgId: string, timestamp: string) => {
    const seconds = parseTimestampToSeconds(timestamp);
    setSeekByMsgId(prev => ({
      ...prev,
      [msgId]: { seconds, nonce: Date.now() }
    }));
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isGenerating) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsGenerating(true);

    setTimeout(() => {
      const lower = text.toLowerCase();
      let responseText = '';

      if (lower.includes('fnol') || lower.includes('reserve')) {
        responseText =
          `1. FNOL Intake: Validates loss date and policy snapshot via PolicyCenter.\n` +
          `2. Exposure Mapping: Creates Vehicle, Property, or Bodily Injury exposures.\n` +
          `3. Reserve Allocation: Gosu InitialReserve rules apply carrier authority limits before assignment.`;
      } else if (lower.includes('cloud api') || lower.includes('gosu') || lower.includes('messaging')) {
        responseText =
          `Cloud API handles external Jutro portals and partner webhooks over JSON:API.\n\n` +
          `Gosu Rules & Messaging handle synchronous TransactionSet validation and guaranteed downstream event delivery inside ClaimCenter.`;
      } else if (lower.includes('policycenter') || lower.includes('coverage') || lower.includes('sync')) {
        responseText =
          `ClaimCenter queries PolicyCenter via IPolicySearchAdapter or REST to freeze coverage limits, deductibles, and endorsements as of the Date of Loss.`;
      } else if (lower.includes('siu') || lower.includes('fraud')) {
        responseText =
          `ClaimCenter evaluates Special Investigations Unit (SIU) questionnaires and automated rule triggers (e.g., recent policy inception, mismatching loss narratives) to increment the claim's fraud score and escalate to an investigator.`;
      } else {
        responseText =
          `Evaluated locally on ${selectedModel.name} (${selectedModel.engine}) at ${selectedModel.tokensPerSec} tok/s with zero network egress.`;
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: {
          tokensPerSec: selectedModel.tokensPerSec,
          ramMB: selectedModel.ramUsageMB,
          latencyMs: Math.round((1000 / selectedModel.tokensPerSec) * 4),
          isPrivate: isPrivacyMode
        }
      };

      setMessages(prev => [...prev, assistantMsg]);
      setIsGenerating(false);
    }, 600);
  };

  return (
    <div
      className={`flex flex-col h-full w-full ${
        embedded ? '' : 'max-w-4xl mx-auto px-3 sm:px-5 pt-3 pb-20'
      }`}
    >
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-zinc-800/80">
          <span className="text-[11px] font-mono text-zinc-500">
            {selectedModel.name} · {selectedModel.quantization}
          </span>

          <button
            type="button"
            onClick={() => (onToggleOffline ? onToggleOffline() : setInternalPrivacy(!internalPrivacy))}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 transition-colors"
          >
            <Shield className={`w-3 h-3 ${isPrivacyMode ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{isPrivacyMode ? 'Offline' : 'Hybrid'}</span>
          </button>
        </div>
      )}

      {/* Messages Stream */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto space-y-2.5 pr-1 scroll-smooth ${embedded ? 'pb-3 min-h-0' : 'pb-24'}`}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {msg.role === 'system' ? (
              <div className="w-full text-center py-1">
                <span className="text-[11px] font-mono text-zinc-500">{msg.content}</span>
              </div>
            ) : (
              <div
                className={`max-w-[92%] rounded-xl p-3 border ${
                  msg.role === 'user'
                    ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                    : 'bg-zinc-900/70 text-zinc-200 border-zinc-800'
                }`}
              >
                <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>

                {msg.audioAttachment && (
                  <div className="mt-2.5 pt-2.5 border-t border-zinc-700/70 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-300">
                      <FileAudio className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{msg.audioAttachment.fileName}</span>
                    </div>

                    <InlineAudioPlayer
                      compact
                      audioUrl={msg.audioAttachment.audioUrl}
                      durationSec={msg.audioAttachment.durationSec}
                      fileName={msg.audioAttachment.fileName}
                      seekRequest={seekByMsgId[msg.id] || null}
                    />

                    {msg.audioAttachment.highlights && msg.audioAttachment.highlights.length > 0 && (
                      <div className="space-y-1 pt-0.5">
                        {msg.audioAttachment.highlights.map((h, idx) => (
                          <div key={idx} className="flex items-baseline gap-1.5 text-[11px] text-zinc-300">
                            <button
                              type="button"
                              onClick={() => handleJumpTimestamp(msg.id, h.timestamp)}
                              aria-label={`Jump to audio at ${h.timestamp}`}
                              className="font-mono tabular-nums px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors shrink-0"
                            >
                              {h.timestamp}
                            </button>
                            <span className="font-medium text-zinc-100">{h.speaker}:</span>
                            <span className="text-zinc-300">{h.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {msg.metadata && (
                  <div className="mt-2 pt-1.5 border-t border-zinc-800 flex flex-wrap items-center gap-2 text-[10px] font-mono tabular-nums text-zinc-400">
                    <span className="text-emerald-400">{msg.metadata.tokensPerSec} tok/s</span>
                    <span>·</span>
                    <span>{msg.metadata.ramMB} MB</span>
                    <span>·</span>
                    <span>{msg.metadata.latencyMs}ms</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isGenerating && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 w-fit">
            <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
            <span className="text-xs text-zinc-400 font-mono">Generating on {selectedModel.name}...</span>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {quickPrompts.map((prompt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSendMessage(prompt)}
            disabled={isGenerating}
            className="shrink-0 text-[11px] px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 transition-colors whitespace-nowrap"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Composer with Inline Audio Import / Record */}
      <div className="relative z-20 flex items-center gap-1.5 p-2 rounded-xl bg-zinc-900 border border-zinc-800">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          aria-label="Attach audio to chat"
          onChange={handleUploadAudio}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach audio file to chat"
          title="Attach audio"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleRecord}
          aria-label={isRecording ? 'Stop audio recording' : 'Record audio in chat'}
          title={isRecording ? 'Stop recording' : 'Record audio'}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0 ${
            isRecording
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
          }`}
        >
          {isRecording ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-4 h-4" />}
        </button>

        <textarea
          aria-label="Ask on-device model"
          rows={1}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={`Ask ${selectedModel.name} locally...`}
          className="flex-1 bg-transparent px-2 py-1.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-hidden resize-none"
        />
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isGenerating}
          aria-label="Send query"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 hover:bg-white disabled:opacity-35 text-zinc-950 transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
