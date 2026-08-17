import { useEffect, useRef, useState } from 'react';

type MessageRole = 'user' | 'ai';

interface Message {
  role: MessageRole;
  text: string;
}

interface HelpAssistantSidebarProps {
  authToken?: string;
}

/*
 * Vite environment variable.
 *
 * Your .env should contain:
 *
 * VITE_API_BASE_URL=https://6ufo0lkytj.execute-api.us-east-1.amazonaws.com/YOUR_STAGE
 *
 * Example:
 *
 * VITE_API_BASE_URL=https://6ufo0lkytj.execute-api.us-east-1.amazonaws.com/prod
 */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '';

function HelpAssistantSidebar({
  authToken,
}: HelpAssistantSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text:
        "Hi! I'm the Sehati Help Assistant. I can help you understand and navigate the application. What would you like help with?",
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /*
   * Automatically scroll to the newest message.
   */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  /*
   * Send a message to the backend.
   */
  async function sendMessage() {
    const text = input.trim();

    if (!text || loading) {
      return;
    }

    const userMessage: Message = {
      role: 'user',
      text,
    };

    /*
     * Add the user's message immediately.
     */
    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setInput('');
    setLoading(true);

    try {
      /*
       * Make sure the API URL has been configured.
       */
      if (!API_BASE_URL) {
        throw new Error(
          'VITE_API_BASE_URL is not configured.',
        );
      }

      const response = await fetch(
        `${API_BASE_URL}/assistant/chat`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',

            ...(authToken
              ? {
                  Authorization: `Bearer ${authToken}`,
                }
              : {}),
          },

          body: JSON.stringify({
            message: text,

            /*
             * Send the last 10 messages as conversation history.
             */
            history: messages.slice(-10),
          }),
        },
      );

      /*
       * Try to read the response even when the server
       * returns an error. This makes debugging easier.
       */
      let data: {
        reply?: string;
        message?: string;
        error?: string;
      } = {};

      try {
        data = await response.json();
      } catch {
        // Response wasn't JSON.
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            `Request failed with status ${response.status}`,
        );
      }

      const assistantReply =
        data.reply ||
        'I could not generate a response. Please try again.';

      /*
       * Add AI response.
       */
      setMessages((previous) => [
        ...previous,
        {
          role: 'ai',
          text: assistantReply,
        },
      ]);
    } catch (error) {
      console.error(
        'Help assistant request failed:',
        error,
      );

      /*
       * Show a useful message to the user.
       */
      let errorMessage =
        'Sorry, something went wrong. Please try again.';

      if (error instanceof Error) {
        console.error(error.message);
      }

      setMessages((previous) => [
        ...previous,
        {
          role: 'ai',
          text: errorMessage,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /*
   * Allow Enter to send the message.
   */
  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();

      void sendMessage();
    }
  }

  return (
    <>
      {/* =====================================================
          FLOATING ASSISTANT BUTTON
          ===================================================== */}

      <button
        type="button"
        onClick={() =>
          setIsOpen((previous) => !previous)
        }
        style={styles.toggleButton}
        aria-label={
          isOpen
            ? 'Close help assistant'
            : 'Open help assistant'
        }
        title="Sehati Help Assistant"
      >
        {isOpen ? '×' : '💬'}
      </button>

      {/* =====================================================
          CHAT PANEL
          ===================================================== */}

      {isOpen && (
        <div
          style={styles.panel}
          role="dialog"
          aria-label="Sehati Help Assistant"
        >
          {/* HEADER */}

          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <div style={styles.aiIcon}>
                ✨
              </div>

              <div>
                <div style={styles.headerTitle}>
                  Sehati Help
                </div>

                <div style={styles.headerSubtitle}>
                  App Assistant
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setIsOpen(false)
              }
              style={styles.closeButton}
              aria-label="Close help assistant"
            >
              ×
            </button>
          </div>

          {/* MESSAGES */}

          <div
            ref={scrollRef}
            style={styles.messages}
          >
            {messages.map(
              (message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    ...styles.messageContainer,

                    ...(message.role === 'user'
                      ? styles.userContainer
                      : styles.aiContainer),
                  }}
                >
                  <div
                    style={{
                      ...styles.messageBubble,

                      ...(message.role ===
                      'user'
                        ? styles.userBubble
                        : styles.aiBubble),
                    }}
                  >
                    {message.text}
                  </div>
                </div>
              ),
            )}

            {/* Loading indicator */}

            {loading && (
              <div
                style={{
                  ...styles.messageContainer,
                  ...styles.aiContainer,
                }}
              >
                <div
                  style={{
                    ...styles.messageBubble,
                    ...styles.aiBubble,
                  }}
                >
                  <span>
                    Thinking...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* INPUT */}

          <div style={styles.inputArea}>
            <div style={styles.inputRow}>
              <input
                type="text"
                value={input}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder="Ask about Sehati..."
                style={styles.input}
                disabled={loading}
                aria-label="Message"
              />

              <button
                type="button"
                onClick={() =>
                  void sendMessage()
                }
                disabled={
                  loading ||
                  !input.trim()
                }
                style={{
                  ...styles.sendButton,

                  ...(loading ||
                  !input.trim()
                    ? styles.sendButtonDisabled
                    : {}),
                }}
              >
                ➤
              </button>
            </div>

            <div style={styles.footerText}>
              AI assistant • Ask about using Sehati
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/*
 * ============================================================
 * STYLES
 * ============================================================
 */

const styles = {
  toggleButton: {
    position: 'fixed' as const,

    bottom: 24,
    right: 24,

    width: 60,
    height: 60,

    borderRadius: '50%',

    border: 'none',

    background:
      'linear-gradient(135deg, #16a34a, #22c55e)',

    color: '#ffffff',

    fontSize: 25,

    cursor: 'pointer',

    boxShadow:
      '0 8px 25px rgba(37, 99, 235, 0.35)',

    zIndex: 99999,

    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',

    transition:
      'transform 0.2s ease, box-shadow 0.2s ease',
  },

  panel: {
    position: 'fixed' as const,

    bottom: 96,
    right: 24,

    width: 360,
    height: 520,

    backgroundColor: '#ffffff',

    borderRadius: 16,

    border:
      '1px solid rgba(148, 163, 184, 0.25)',

    boxShadow:
      '0 20px 50px rgba(15, 23, 42, 0.25)',

    display: 'flex',

    flexDirection: 'column' as const,

    overflow: 'hidden',

    zIndex: 99999,

    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  header: {
    background:
      'linear-gradient(135deg, #16a34a, #22c55e)',

    color: '#ffffff',

    padding: '15px 16px',

    display: 'flex',

    justifyContent: 'space-between',

    alignItems: 'center',
  },

  headerLeft: {
    display: 'flex',

    alignItems: 'center',

    gap: 10,
  },

  aiIcon: {
    width: 36,
    height: 36,

    borderRadius: 10,

    background:
      'rgba(255,255,255,0.18)',

    display: 'flex',

    alignItems: 'center',

    justifyContent: 'center',

    fontSize: 18,
  },

  headerTitle: {
    fontWeight: 700,

    fontSize: 15,
  },

  headerSubtitle: {
    fontSize: 11,

    opacity: 0.8,

    marginTop: 2,
  },

  closeButton: {
    background: 'transparent',

    border: 'none',

    color: '#ffffff',

    cursor: 'pointer',

    fontSize: 24,

    lineHeight: 1,

    padding: 4,
  },

  messages: {
    flex: 1,

    overflowY: 'auto' as const,

    padding: 14,

    display: 'flex',

    flexDirection: 'column' as const,

    gap: 10,

    background: '#f8fafc',
  },

  messageContainer: {
    display: 'flex',

    width: '100%',
  },

  aiContainer: {
    justifyContent: 'flex-start',
  },

  userContainer: {
    justifyContent: 'flex-end',
  },

  messageBubble: {
    maxWidth: '82%',

    padding: '10px 13px',

    borderRadius: 14,

    fontSize: 14,

    lineHeight: 1.5,

    wordBreak: 'break-word' as const,
  },

  userBubble: {
    background: '#16a34a',

    color: '#ffffff',

    borderBottomRightRadius: 4,
  },

  aiBubble: {
    background: '#e2e8f0',

    color: '#1e293b',

    borderBottomLeftRadius: 4,
  },

  inputArea: {
    borderTop:
      '1px solid #e2e8f0',

    padding: 10,

    background: '#ffffff',
  },

  inputRow: {
    display: 'flex',

    gap: 8,

    alignItems: 'center',
  },

  input: {
    flex: 1,

    minWidth: 0,

    border:
      '1px solid #cbd5e1',

    borderRadius: 10,

    padding:
      '10px 12px',

    fontSize: 14,

    outline: 'none',

    color: '#0f172a',

    backgroundColor: '#ffffff',
  },

  sendButton: {
    width: 40,

    height: 40,

    border: 'none',

    borderRadius: 10,

    background: '#16a34a',

    color: '#ffffff',

    fontSize: 18,

    cursor: 'pointer',

    display: 'flex',

    alignItems: 'center',

    justifyContent: 'center',
  },

  sendButtonDisabled: {
    background: '#94a3b8',

    cursor: 'not-allowed',
  },

  footerText: {
    fontSize: 10,

    color: '#94a3b8',

    marginTop: 7,

    textAlign: 'center' as const,
  },
};

export default HelpAssistantSidebar;