import combineReducers from "../utils/combine-reducers";
import { indexBy, unique, sort } from "../utils/array";
import { getMentions } from "../utils/message";
import {
  selectServerMembers,
  selectServerMemberWithUserId,
  selectUser,
} from "./server-members";

const entriesById = (state = {}, action) => {
  switch (action.type) {
    case "initial-data-request-successful": {
      const readStatesByChannelId = indexBy(
        (s) => s.channel,
        action.data.read_states
      );

      const allChannels = [
        ...action.data.servers.flatMap((s) =>
          s.channels.map((c) => ({ ...c, serverId: s.id }))
        ),
        ...action.data.dms,
      ];

      const channelsById = indexBy((c) => c.id, allChannels);

      const entriesById = Object.fromEntries(
        Object.entries(channelsById).map(([id, channel]) => {
          const readStates = readStatesByChannelId[id];
          const properties = {
            id,
            name: channel.name,
            kind: channel.kind,
            serverId: channel.serverId,
            lastMessageAt: channel.last_message_at,
            lastReadAt: readStates?.last_read_at ?? null,
            unreadMentionMessageIds: Array(readStates?.mention_count ?? 0).fill(
              null
            ),
          };
          if (channel.kind === "dm") {
            properties.memberUserIds = channel.members;
            properties.ownerUserId = channel.owner;
          }
          return [id, properties];
        })
      );

      return {
        ...state,
        ...entriesById,
      };
    }

    case "mark-channel-read":
      return {
        ...state,
        [action.data.channelId]: {
          ...state[action.data.channelId],
          lastReadAt: action.data.date.toISOString(),
          unreadMentionMessageIds: [],
        },
      };

    case "message-create-request-sent":
    case "message-create-request-successful":
      return {
        ...state,
        [action.message.channel]: {
          ...state[action.message.channel],
          lastReadAt: action.message.created_at,
          lastMessageAt: action.message.created_at,
        },
      };

    case "server-event:message-created": {
      const isOwnMessage = action.data.message.author === action.user.id;
      const channel = state[action.data.message.channel];

      const userMentions = getMentions(action.data.message.blocks).filter(
        (m) => m.ref === action.user.id
      );
      const unreadMentionMessageIds = channel?.unreadMentionMessageIds ?? [];

      return {
        ...state,
        [action.data.message.channel]: {
          ...channel,
          lastMessageAt: action.data.message.created_at,
          lastReadAt: isOwnMessage
            ? action.data.message.created_at
            : channel?.lastReadAt,
          unreadMentionMessageIds:
            userMentions.length === 0
              ? unreadMentionMessageIds
              : [...unreadMentionMessageIds, action.data.message.id],
        },
      };
    }

    case "server-event:message-removed": {
      const channel = state[action.data.message.channel];
      return {
        ...state,
        [action.data.message.channel]: {
          ...channel,
          unreadMentionMessageIds: channel.unreadMentionMessageIds.filter(
            (id) => id !== action.data.message.id
          ),
        },
      };
    }

    case "server-event:message-updated": {
      const channel = state[action.data.message.channel];
      const messageId = action.data.message.id;
      const userMentions = getMentions(action.data.message.blocks).filter(
        (m) => m.ref === action.user.id
      );

      return {
        ...state,
        [action.data.message.channel]: {
          ...channel,
          unreadMentionMessageIds:
            userMentions.length === 0
              ? channel.unreadMentionMessageIds.filter((id) => id !== messageId)
              : unique([...channel.unreadMentionMessageIds, messageId]),
        },
      };
    }

    default:
      return state;
  }
};

const typingUserIdsByChannelId = (state = {}, action) => {
  switch (action.type) {
    case "server-event:user-typed": {
      const channelId = action.data.channel.id;
      const channelTypingUserIds = state[channelId] ?? [];
      return {
        ...state,
        [channelId]: unique([...channelTypingUserIds, action.data.user.id]),
      };
    }

    case "server-event:message-created": {
      const channelId = action.data.message.channel;
      const authorUserId = action.data.message.author;
      return {
        ...state,
        [channelId]:
          state[channelId]?.filter((id) => id !== authorUserId) ?? [],
      };
    }

    case "user-typing-ended":
      return {
        ...state,
        [action.channelId]:
          state[action.channelId]?.filter((id) => id !== action.userId) ?? [],
      };

    default:
      return state;
  }
};

const selectChannelTypingUserIds = (state) => (channelId) =>
  state.channels.typingUserIdsByChannelId[channelId] ?? [];

export const selectChannel = (state) => (id) => {
  const channel = state.channels.entriesById[id];

  if (channel == null) return null;

  const getLastReadTimestamp = () => {
    if (channel.kind === "dm")
      return channel.lastReadAt == null
        ? new Date().getTime()
        : new Date(channel.lastReadAt).getTime();

    const userServerMember = selectServerMemberWithUserId(state)(
      channel.serverId,
      state.user.id
    );

    const serverJoinTimestamp = new Date(userServerMember.joined_at).getTime();

    return channel.lastReadAt == null
      ? serverJoinTimestamp
      : new Date(channel.lastReadAt).getTime();
  };

  const buildName = () => {
    if (channel.kind !== "dm" || channel.name != null) return channel.name;

    if (channel.memberUserIds.length === 1) return "Me";

    return channel.memberUserIds
      .filter((id) => id !== state.user.id)
      .map((id) => {
        const user = selectUser(state)(id);
        return user?.displayName;
      })
      .filter(Boolean)
      .join(", ");
  };

  const lastReadTimestamp = getLastReadTimestamp();

  const lastMessageTimestamp = new Date(channel.lastMessageAt).getTime();

  const typingMembersUserIds = selectChannelTypingUserIds(state)(id).filter(
    (id) => id !== state.user.id
  );
  const typingMembers =
    channel.kind === "dm"
      ? typingMembersUserIds.map(selectUser(state))
      : typingMembersUserIds.map((userId) =>
          selectServerMemberWithUserId(state)(channel.serverId, userId)
        );

  return {
    ...channel,
    name: buildName(),
    hasUnread: lastReadTimestamp < lastMessageTimestamp,
    mentionCount: channel.unreadMentionMessageIds.length,
    typingMembers,
  };
};

export const selectDmChannelFromUserId = (state) => (userId) => {
  const dmChannels = selectDmChannels(state)();
  const userDmChannels = dmChannels.filter(
    (c) => c.memberUserIds.length <= 2 && c.memberUserIds.includes(userId)
  );

  if (userDmChannels.length > 1) throw new Error();

  return userDmChannels[0];
};

export const selectDmChannelFromUserIds = (state) => (userIds) => {
  const dmChannels = selectDmChannels(state)();
  return dmChannels.find(
    (c) =>
      c.memberUserIds.length === userIds.length &&
      c.memberUserIds.every((id) => userIds.includes(id))
  );
};

export const selectServerChannels = (state) => (serverId) => {
  return Object.values(state.channels.entriesById)
    .filter((channel) => channel.serverId === serverId)
    .map((c) => selectChannel(state)(c.id));
};

export const selectServerDmChannels = (state) => (serverId) => {
  const memberUserIds = selectServerMembers(state)(serverId).map((m) => m.id);
  return selectDmChannels(state)().filter((c) =>
    c.memberUserIds.every((userId) => memberUserIds.includes(userId))
  );
};

export const selectDmChannels = (state) => () => {
  const channels = Object.values(state.channels.entriesById)
    .filter((channel) => channel.kind === "dm")
    .map((c) => selectChannel(state)(c.id));

  return sort((c1, c2) => {
    const [t1, t2] = [c1, c2].map((c) => new Date(c.lastMessageAt).getTime());
    return t1 > t2 ? -1 : t1 < t2 ? 1 : 0;
  }, channels);
};

export default combineReducers({ entriesById, typingUserIdsByChannelId });
