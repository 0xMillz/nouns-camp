import { swc } from "rollup-plugin-swc3";

const plugins = [
  swc({
    jsc: {
      parser: {
        syntax: "ecmascript",
        jsx: true,
      },
      transform: {
        react: {
          runtime: "automatic",
          importSource: "@emotion/react",
        },
      },
    },
  }),
];

const createConfig = ({ file, dependencies = [] }) => ({
  input: `src/${file}`,
  output: {
    file: `dist/${file}`,
    format: "esm",
  },
  external: dependencies,
  plugins,
});

const emotionDeps = ["@emotion/react", "@emotion/react/jsx-runtime"];

const entrypoints = [
  { file: "theme.js" },
  { file: "icons.js", dependencies: ["react", ...emotionDeps] },
  {
    file: "sidebar-layout.js",
    dependencies: ["@shades/common/react", "react", ...emotionDeps],
  },
  {
    file: "dialog.js",
    dependencies: ["react", "react-aria", ...emotionDeps],
  },
  {
    file: "button.js",
    dependencies: ["react", "react-aria", ...emotionDeps],
  },
  { file: "icon-button.js", dependencies: ["react", ...emotionDeps] },
  { file: "rich-text.js", dependencies: ["react", ...emotionDeps] },
  { file: "emoji.js", dependencies: ["react", ...emotionDeps] },
  { file: "avatar.js", dependencies: ["react", ...emotionDeps] },
  {
    file: "account-avatar.js",
    dependencies: [
      "react",
      "wagmi",
      "@shades/common/app",
      "@shades/common/nouns",
      ...emotionDeps,
    ],
  },
  {
    file: "account-avatar-stack.js",
    dependencies: [
      "react",
      "wagmi",
      "@shades/common/app",
      "@shades/common/nouns",
      "@shades/common/utils",
      ...emotionDeps,
    ],
  },
  {
    file: "channel-avatar.js",
    dependencies: [
      "react",
      "wagmi",
      "@shades/common/app",
      "@shades/common/nouns",
      "@shades/common/utils",
      ...emotionDeps,
    ],
  },
  {
    file: "channel-messages-scroll-view.js",
    dependencies: [
      "react",
      "@shades/common/app",
      "@shades/common/react",
      "@shades/common/nouns",
      ...emotionDeps,
    ],
  },
];

export default [
  ...entrypoints.map(createConfig),
  createConfig({
    file: "index.js",
    dependencies: [...new Set(entrypoints.flatMap((e) => e.dependencies))],
  }),
];
