// Gemeinsame Konstanten für Engine, Renderer und UI (keine DOM-Abhängigkeiten).

export const TOPICS = ['pol', 'his', 'mus', 'sci', 'geo', 'pop'];

export const TOPIC_INFO = {
  pol: { color: '#4f8cff', icon: '⚖', key: 'topic.pol' },
  his: { color: '#e0a84a', icon: '📜', key: 'topic.his' },
  mus: { color: '#e55ad2', icon: '♪', key: 'topic.mus' },
  sci: { color: '#3fe0c5', icon: '⚛', key: 'topic.sci' },
  geo: { color: '#6ad04b', icon: '🌍', key: 'topic.geo' },
  pop: { color: '#ff6a4d', icon: '🎬', key: 'topic.pop' },
};

export const EPOCHS = ['antike', 'mittelalter', 'industrie', 'weltkrieg', 'kalterkrieg', 'zukunft'];

export const EPOCH_INFO = {
  antike:      { key: 'epoch.antike',      color: '#f2d39b', accent: '#ffcf6b', sky: '#3a2a18', boss: 'race' },
  mittelalter: { key: 'epoch.mittelalter', color: '#7fa86a', accent: '#b6e07a', sky: '#1d2a1a', boss: 'order' },
  industrie:   { key: 'epoch.industrie',   color: '#a7765a', accent: '#ff8a3d', sky: '#2a1a14', boss: 'match' },
  weltkrieg:   { key: 'epoch.weltkrieg',   color: '#7d8263', accent: '#d8d07a', sky: '#1f2118', boss: 'race' },
  kalterkrieg: { key: 'epoch.kalterkrieg', color: '#8a9bb0', accent: '#ff4d6a', sky: '#151a24', boss: 'order' },
  zukunft:     { key: 'epoch.zukunft',     color: '#5b6cff', accent: '#45f3ff', sky: '#0b0d2a', boss: 'match' },
};

export const FIELD_TYPES = ['topic', 'event', 'duel', 'parliament', 'concert', 'market', 'portal', 'challenge', 'hub', 'bridge'];

export const FIELD_INFO = {
  topic:      { icon: '?',  color: '#ffffff', key: 'field.topic' },
  event:      { icon: '⚡', color: '#ffd84d', key: 'field.event' },
  duel:       { icon: '⚔', color: '#ff4d4d', key: 'field.duel' },
  parliament: { icon: '🏛', color: '#8f7bff', key: 'field.parliament' },
  concert:    { icon: '♫', color: '#e55ad2', key: 'field.concert' },
  market:     { icon: '⇄', color: '#5fe08a', key: 'field.market' },
  portal:     { icon: '◎', color: '#45f3ff', key: 'field.portal' },
  challenge:  { icon: '♛', color: '#ffb300', key: 'field.challenge' },
  hub:        { icon: '✦', color: '#ffffff', key: 'field.hub' },
};

export const PLAYER_COLORS = [
  { id: 'cyan',    hex: '#2fe6ff', symbol: '●' },
  { id: 'magenta', hex: '#ff3fb4', symbol: '▲' },
  { id: 'gold',    hex: '#ffc83a', symbol: '■' },
  { id: 'lime',    hex: '#8cff4a', symbol: '◆' },
  { id: 'violet',  hex: '#a77bff', symbol: '★' },
  { id: 'orange',  hex: '#ff8a2b', symbol: '✚' },
];

export const FIGURES = ['chronist', 'ingenieurin', 'diplomatin', 'pilot'];

export const GOAL_FRAGMENTS = 5;
export const HAND_LIMIT = 5;
export const MAX_PLAYERS = 4;
