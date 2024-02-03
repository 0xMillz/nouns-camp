import React from "react";
import NextLink from "next/link";
import { css } from "@emotion/react";
import { Noggles as NogglesIcon } from "@shades/ui-web/icons";
import * as Tooltip from "@shades/ui-web/tooltip";
import Spinner from "@shades/ui-web/spinner";
import Link from "@shades/ui-web/link";
import { isSucceededState as isSucceededProposalState } from "../utils/proposals.js";
import {
  extractSlugFromId as extractSlugFromCandidateId,
  makeUrlId as makeCandidateUrlId,
} from "../utils/candidates.js";
import { useProposal, useProposalCandidate } from "../store.js";
import AccountPreviewPopoverTrigger from "./account-preview-popover-trigger.js";
import FormattedDateWithTooltip from "./formatted-date-with-tooltip.js";
import AccountAvatar from "./account-avatar.js";

const MarkdownRichText = React.lazy(() => import("./markdown-rich-text.js"));

const BODY_TRUNCATION_HEIGHT_THRESHOLD = 250;

const ActivityFeed = ({ context, items = [], spacing = "2rem" }) => (
  <React.Suspense fallback={null}>
    <ul
      css={(t) =>
        css({
          lineHeight: 1.4285714286, // 20px line height given font size if 14px
          fontSize: t.text.sizes.base,
          '[role="listitem"] + [role="listitem"]': {
            marginTop: "var(--vertical-spacing)",
          },
          '[data-pending="true"]': { opacity: 0.6 },
          "[data-nowrap]": { whiteSpace: "nowrap" },
          "[data-header]": {
            display: "grid",
            gridTemplateColumns: "2rem minmax(0,1fr)",
            gridGap: "0.6rem",
            alignItems: "flex-start",
            a: {
              color: t.colors.textDimmed,
              fontWeight: t.text.weights.emphasis,
              textDecoration: "none",
              "@media(hover: hover)": {
                ":hover": { textDecoration: "underline" },
              },
            },
          },
          "[data-avatar-button]": {
            display: "block",
            outline: "none",
            ":focus-visible [data-avatar]": {
              boxShadow: t.shadows.focus,
              background: t.colors.backgroundModifierHover,
            },
            "@media (hover: hover)": {
              ":not(:disabled)": {
                cursor: "pointer",
                ":hover [data-avatar]": {
                  boxShadow: `0 0 0 0.2rem ${t.colors.backgroundModifierHover}`,
                },
              },
            },
          },
          "[data-timeline-symbol]": {
            position: "relative",
            height: "2rem",
            width: "0.1rem",
            background: t.colors.borderLight,
            zIndex: -1,
            margin: "auto",
            ":after": {
              content: '""',
              position: "absolute",
              width: "0.7rem",
              height: "0.7rem",
              background: t.colors.textMuted,
              top: "50%",
              left: "50%",
              transform: "translateY(-50%) translateX(-50%)",
              borderRadius: "50%",
              border: "0.1rem solid",
              borderColor: t.colors.backgroundPrimary,
            },
          },
        })
      }
      style={{ "--vertical-spacing": spacing }}
    >
      {items.map((item) => (
        <FeedItem key={item.id} {...item} context={context} />
      ))}
    </ul>
  </React.Suspense>
);

const FeedItem = React.memo(({ context, ...item }) => {
  const isIsolatedContext = ["proposal", "candidate"].includes(context);
  return (
    <div key={item.id} role="listitem" data-pending={item.isPending}>
      <div data-header>
        <div>
          {item.type === "event" || item.authorAccount == null ? (
            <div data-timeline-symbol />
          ) : (
            <AccountPreviewPopoverTrigger accountAddress={item.authorAccount}>
              <button data-avatar-button>
                <AccountAvatar
                  data-avatar
                  address={item.authorAccount}
                  size="2rem"
                />
              </button>
            </AccountPreviewPopoverTrigger>
          )}
        </div>
        <div>
          <div
            css={css({
              display: "flex",
              alignItems: "flex-start",
              gap: "1rem",
              cursor: "default",
            })}
          >
            <div
              css={(t) =>
                css({
                  flex: 1,
                  minWidth: 0,
                  // display: "-webkit-box",
                  // WebkitBoxOrient: "vertical",
                  // WebkitLineClamp: 2,
                  // overflow: "hidden",
                  color: t.colors.textDimmed,
                })
              }
            >
              <span css={(t) => css({ color: t.colors.textNormal })}>
                <ItemTitle item={item} context={context} />
              </span>
            </div>
            <div>
              {item.isPending ? (
                <div style={{ padding: "0.5rem 0" }}>
                  <Spinner size="1rem" />
                </div>
              ) : (
                item.timestamp != null && (
                  <span
                    data-timestamp
                    css={(t) =>
                      css({
                        fontSize: t.text.sizes.small,
                        color: t.colors.textDimmed,
                        padding: "0.15rem 0",
                        display: "inline-block",
                      })
                    }
                  >
                    <FormattedDateWithTooltip
                      tinyRelative
                      relativeDayThreshold={7}
                      month="short"
                      day="numeric"
                      value={item.timestamp}
                    />
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
      <div css={css({ paddingLeft: "2.6rem", userSelect: "text" })}>
        {(item.body || null) != null && (
          <ItemBody
            text={item.body}
            displayImages={item.type === "event"}
            truncateLines={!isIsolatedContext}
          />
        )}
        {item.type === "candidate-signature-added" && (
          <div
            css={(t) =>
              css({
                fontSize: t.text.sizes.small,
                color: t.colors.textDimmed,
              })
            }
          >
            {item.isCanceled ? (
              "Signature canceled"
            ) : (
              <>
                {item.expiresAt < new Date()
                  ? "Signature expired"
                  : "Signature expires"}{" "}
                <FormattedDateWithTooltip
                  capitalize={false}
                  value={item.expiresAt}
                  month="short"
                  day="numeric"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const ItemBody = React.memo(
  ({ text, displayImages, truncateLines: enableLineTruncation }) => {
    const containerRef = React.useRef();

    const [isCollapsed_, setCollapsed] = React.useState(enableLineTruncation);
    const [exceedsTruncationThreshold, setExceedsTruncationThreshold] =
      React.useState(null);

    const isEnabled = enableLineTruncation && exceedsTruncationThreshold;
    const isCollapsed = isEnabled && isCollapsed_;

    React.useEffect(() => {
      const observer = new ResizeObserver(() => {
        if (containerRef.current == null) return;
        setExceedsTruncationThreshold(
          containerRef.current.scrollHeight >
            BODY_TRUNCATION_HEIGHT_THRESHOLD + 100
        );
      });

      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
      };
    }, []);

    return (
      <div css={css({ padding: "0.5rem 0" })}>
        <div
          ref={containerRef}
          css={css({ overflow: "hidden" })}
          style={{
            maxHeight: isCollapsed
              ? `${BODY_TRUNCATION_HEIGHT_THRESHOLD}px`
              : undefined,
            maskImage: isCollapsed
              ? "linear-gradient(180deg, black calc(100% - 2.8em), transparent 100%)"
              : undefined,
          }}
        >
          <MarkdownRichText
            text={text}
            displayImages={displayImages}
            compact
            css={css({
              // Make all headings small
              "h1,h2,h3,h4,h5,h6": { fontSize: "1em" },
              "*+h1,*+h2,*+h3,*+h4,*+h5,*+h6": { marginTop: "1.5em" },
              "h1:has(+*),h2:has(+*),h3:has(+*),h4:has(+*),h5:has(+*),h6:has(+*)":
                {
                  marginBottom: "0.625em",
                },
            })}
          />
        </div>

        {isEnabled && (
          <div css={css({ margin: "0.8em 0" })}>
            <Link
              component="button"
              onClick={() => setCollapsed((c) => !c)}
              size="small"
              color={(t) => t.colors.textDimmed}
            >
              {isCollapsed ? "Expand..." : "Collapse"}
            </Link>
          </div>
        )}
      </div>
    );
  }
);

const ItemTitle = ({ item, context }) => {
  const isIsolatedContext = ["proposal", "candidate"].includes(context);

  const proposal = useProposal(item.proposalId ?? item.targetProposalId);
  const candidate = useProposalCandidate(item.candidateId);

  const ContextLink = ({ proposalId, candidateId, short, children }) => {
    if (proposalId != null) {
      const title =
        proposal?.title == null
          ? `Proposal ${proposalId}`
          : `${short ? proposalId : `Proposal ${proposalId}`}: ${
              proposal.title
            } `;
      return (
        <NextLink prefetch href={`/proposals/${proposalId}`}>
          {children ?? title}
        </NextLink>
      );
    }

    if (candidateId != null) {
      const title =
        candidate?.latestVersion?.content.title ??
        extractSlugFromCandidateId(candidateId);
      return (
        <NextLink
          prefetch
          href={`/candidates/${encodeURIComponent(
            makeCandidateUrlId(candidateId)
          )}`}
        >
          {children ?? title}
        </NextLink>
      );
    }

    throw new Error();
  };

  const accountName = (
    <AccountPreviewPopoverTrigger accountAddress={item.authorAccount} />
  );

  switch (item.type) {
    case "event": {
      switch (item.eventType) {
        case "proposal-created":
        case "proposal-updated":
          return (
            <span css={(t) => css({ color: t.colors.textDimmed })}>
              {context === "proposal" ? "Proposal" : <ContextLink {...item} />}{" "}
              {item.eventType === "proposal-created" ? "created" : "updated"}
              {item.authorAccount != null && (
                <>
                  {" "}
                  by{" "}
                  <AccountPreviewPopoverTrigger
                    showAvatar
                    accountAddress={item.authorAccount}
                  />
                </>
              )}
            </span>
          );

        case "candidate-created":
        case "candidate-updated": {
          const label =
            context === "candidate" ? (
              "Candidate"
            ) : context === "proposal" ? (
              <ContextLink {...item}>
                {item.targetProposalId != null
                  ? "Update candidate"
                  : "Candidate"}
              </ContextLink>
            ) : item.targetProposalId != null ? (
              <>
                <ContextLink {...item}>Update candidate</ContextLink> for{" "}
                <ContextLink proposalId={item.targetProposalId} truncate />
              </>
            ) : (
              <>
                Candidate <ContextLink {...item} />
              </>
            );

          return (
            <span css={(t) => css({ color: t.colors.textDimmed })}>
              {label}{" "}
              {item.eventType === "candidate-created" ? "created" : "updated"}
              {item.authorAccount != null && (
                <>
                  {" "}
                  by{" "}
                  <AccountPreviewPopoverTrigger
                    showAvatar
                    accountAddress={item.authorAccount}
                  />
                </>
              )}
            </span>
          );
        }

        case "candidate-canceled":
          return (
            <span
              css={(t) =>
                css({
                  color: t.colors.textDimmed,
                })
              }
            >
              {context === "proposal" ? (
                <ContextLink {...item}>
                  {item.targetProposalId == null
                    ? "Candidate"
                    : "Update candidate"}
                </ContextLink>
              ) : context === "candidate" ? (
                "Candidate"
              ) : (
                <ContextLink {...item} />
              )}{" "}
              was canceled
            </span>
          );

        case "proposal-started":
          return (
            <span css={(t) => css({ color: t.colors.textDimmed })}>
              Voting{" "}
              {context !== "proposal" && (
                <>
                  for <ContextLink {...item} />
                </>
              )}{" "}
              started{" "}
            </span>
          );

        case "proposal-ended":
          return (
            <span css={(t) => css({ color: t.colors.textDimmed })}>
              {context === "proposal" ? "Proposal" : <ContextLink {...item} />}{" "}
              {isSucceededProposalState(proposal.state) ? (
                <span
                  css={(t) =>
                    css({
                      color: t.colors.textPositive,
                      fontWeight: t.text.weights.emphasis,
                    })
                  }
                >
                  succeeded
                </span>
              ) : (
                <>
                  was{" "}
                  <span
                    css={(t) =>
                      css({
                        color: t.colors.textNegative,
                        fontWeight: t.text.weights.emphasis,
                      })
                    }
                  >
                    defeated
                  </span>
                </>
              )}
            </span>
          );

        case "proposal-objection-period-started":
          return (
            <span
              css={(t) =>
                css({
                  color: t.colors.textDimmed,
                })
              }
            >
              {context === "proposal" ? "Proposal" : <ContextLink {...item} />}{" "}
              entered objection period
            </span>
          );

        case "proposal-queued":
          return (
            <span
              css={(t) =>
                css({
                  color: t.colors.textDimmed,
                })
              }
            >
              {context === "proposal" ? "Proposal" : <ContextLink {...item} />}{" "}
              was queued for execution
            </span>
          );

        case "proposal-executed":
          return (
            <span
              css={(t) =>
                css({
                  color: t.colors.textDimmed,
                })
              }
            >
              {context === "proposal" ? "Proposal" : <ContextLink {...item} />}{" "}
              was{" "}
              <span
                css={(t) =>
                  css({
                    color: t.colors.textPositive,
                    fontWeight: t.text.weights.emphasis,
                  })
                }
              >
                executed
              </span>
            </span>
          );

        case "proposal-canceled":
          return (
            <span
              css={(t) =>
                css({
                  color: t.colors.textDimmed,
                })
              }
            >
              {context === "proposal" ? "Proposal" : <ContextLink {...item} />}{" "}
              was{" "}
              <span
                css={(t) =>
                  css({
                    color: t.colors.textNegative,
                    fontWeight: t.text.weights.emphasis,
                  })
                }
              >
                canceled
              </span>
            </span>
          );

        case "propdate-posted":
          return (
            <span
              css={(t) =>
                css({
                  color: t.colors.textDimmed,
                })
              }
            >
              <a
                href="https://propdates.wtf/about"
                target="_blank"
                rel="noreferrer"
              >
                Propdate
              </a>
              {context !== "proposal" && (
                <>
                  {" "}
                  for <ContextLink {...item} />
                </>
              )}
            </span>
          );

        case "propdate-marked-completed":
          return (
            <span
              css={(t) =>
                css({
                  color: t.colors.textDimmed,
                })
              }
            >
              {context === "proposal" ? "Proposal" : <ContextLink {...item} />}{" "}
              marked as completed via{" "}
              <a
                href="https://propdates.wtf/about"
                target="_blank"
                rel="noreferrer"
              >
                Propdate
              </a>
            </span>
          );

        default:
          throw new Error(`Unknown event "${item.eventType}"`);
      }
    }

    case "vote":
    case "feedback-post": {
      const signalWord = item.type === "vote" ? "voted" : "signaled";
      return (
        <span>
          {accountName}{" "}
          {item.support === 0 ? (
            <Signal negative>
              {signalWord} against ({item.voteCount})
            </Signal>
          ) : item.support === 1 ? (
            <Signal positive>
              {signalWord} for ({item.voteCount})
            </Signal>
          ) : item.type === "vote" ? (
            <Signal>abstained</Signal>
          ) : isIsolatedContext ? (
            "commented"
          ) : (
            "commented on"
          )}
          {!isIsolatedContext && (
            <>
              {" "}
              <ContextLink short {...item} />
            </>
          )}
        </span>
      );
    }

    case "candidate-signature-added":
      return (
        <span>
          {accountName} <Signal positive>sponsored candidate</Signal>
          {!isIsolatedContext && (
            <>
              {" "}
              <ContextLink short {...item} />
            </>
          )}
        </span>
      );

    default:
      throw new Error(`Unknown event type "${item.type}"`);
  }
};

const Signal = ({ positive, negative, ...props }) => (
  <span
    css={(t) =>
      css({
        "--positive-text": t.colors.textPositive,
        "--negative-text": t.colors.textNegative,
        "--neutral-text": t.colors.textDimmed,
        color: "var(--color)",
        fontWeight: t.text.weights.emphasis,
      })
    }
    style={{
      "--color": positive
        ? "var(--positive-text)"
        : negative
        ? "var(--negative-text)"
        : "var(--neutral-text)",
    }}
    {...props}
  />
);

export const VotingPowerNoggle = ({ count }) => (
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <span
        css={(t) =>
          css({
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: t.text.sizes.small,
            color: t.colors.textDimmed,
          })
        }
      >
        {count}
        <NogglesIcon
          style={{
            display: "inline-flex",
            width: "1.7rem",
            height: "auto",
          }}
        />
      </span>
    </Tooltip.Trigger>
    <Tooltip.Content side="top" sideOffset={5}>
      {count} {count === 1 ? "noun" : "nouns"}
    </Tooltip.Content>
  </Tooltip.Root>
);

export default ActivityFeed;