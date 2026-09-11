# AI CoAudS - Agentic AI Code Audit System

A modern, agentic AI-powered code audit system that uses autonomous agents to analyze code for security vulnerabilities, code quality issues, and best practices.

## ✨ Features

- 🤖 **Agentic AI**: Autonomous agents that reason, plan, and execute code audits
- 🔍 **Real-time Visualization**: Watch the AI think, act, observe, and reflect in real-time
- 🎨 **Modern UI**: Beautiful glassmorphism design with smooth animations
- 📊 **5-Specialist Security Panel**: Specialized agents for different security domains
- 🔄 **ReAct Pattern**: Implements the Reason-Act-Observe-Reflect agent loop
- 💾 **Simulation Mode**: Works without API keys using intelligent simulation
- 🌐 **Multi-Provider Support**: Works with Anthropic Claude and OpenAI GPT models
- ⚡ **Streaming Responses**: Real-time token-by-token output
- 🎯 **Tool Use**: Agents can call tools to gather information and execute actions

## 🚀 Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:5173`

## 📖 Usage

### Without API Key (Simulation Mode)

The system works out of the box with intelligent simulation mode. Simply:
1. Enter a task (e.g., "Audit this React component for security vulnerabilities")
2. Paste code context
3. Click "Run Agent"
4. Watch the AI agent think, act, and analyze in real-time

### With API Key (Live LLM Mode)

For real AI-powered analysis:
1. Click the settings icon in the top right
2. Enter your Anthropic or OpenAI API key
3. Select your preferred model
4. Run audits with real LLM-powered agents

## 🏗️ Architecture

### Agent Runtime

The system uses a **ReAct (Reason-Act-Observe-Reflect)** pattern:

1. **Think**: Agent analyzes the task and plans approach
2. **Act**: Agent calls tools to gather information
3. **Observe**: Agent analyzes tool results
4. **Reflect**: Agent evaluates findings and decides next steps

This creates a continuous loop of intelligent analysis until the task is complete.

### 5-Specialist Security Panel

- **Injection Hunter**: SQL injection, command injection, XSS, template injection
- **Secrets Sentinel**: Hardcoded credentials, API keys, tokens, private keys
- **Access Auditor**: Authentication, authorization, IDOR, session management
- **Supply-Chain Auditor**: Dependencies, deserialization, package vulnerabilities
- **Crypto & Transport Auditor**: Weak cryptography, TLS/SSL issues, secure communication

### Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Build Tool**: Vite 7
- **AI Integration**: Anthropic Claude, OpenAI GPT
- **Styling**: Glassmorphism, modern animations, gradient effects
- **State Management**: React hooks with streaming updates
- **Agent Pattern**: ReAct with tool use and reflection

## 🛠️ Development

### Project Structure

```
src/
├── agents/
│   ├── runtime.ts          # Agentic AI runtime (ReAct loop)
│   ├── mantis/             # Security specialist agents
│   └── tools/              # Tool implementations
├── components/
│   ├── Console.tsx         # Modern agentic console UI
│   ├── Architecture.tsx    # System architecture view
│   ├── Codebase.tsx        # Code browser
│   └── Readme.tsx          # Documentation viewer
├── config.ts               # Configuration
├── App.tsx                 # Main application
└── index.css               # Modern CSS with glassmorphism
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run typecheck` - Run TypeScript type checking

## ⚙️ Configuration

Edit `src/config.ts` to customize:

```typescript
export const CONFIG = {
  llm: {
    provider: "anthropic",  // or "openai"
    model: "claude-3-5-sonnet-20241022",
    apiKey: "",             // Set via UI or environment
    maxTokens: 4096,
    temperature: 0.3,
  },
  agents: {
    maxSteps: 10,
    enableSimulation: true,
  },
};
```

## 🔒 Security

- API keys are stored in browser memory only (never persisted)
- All LLM calls are made directly from the browser
- No backend server required for basic functionality
- Simulation mode works completely offline
- CORS-enabled API calls for direct browser integration

## 🌍 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## 📦 Build Output

```
dist/
├── index.html                    # Entry point
└── assets/
    ├── index-[hash].css          # Main styles (glassmorphism)
    ├── index-[hash].js           # Main bundle
    ├── Console-[hash].js         # Console component (lazy loaded)
    ├── Architecture-[hash].js    # Architecture view (lazy loaded)
    ├── Codebase-[hash].js        # Code browser (lazy loaded)
    └── Readme-[hash].js          # Documentation (lazy loaded)
```

## 🎨 Design System

- **Glassmorphism**: Frosted glass effects with backdrop blur
- **Gradient Text**: Beautiful gradient headings
- **Smooth Animations**: Fade, slide, pulse effects
- **Modern Color Palette**: Dark theme with vibrant accents
- **Responsive Design**: Works on all screen sizes

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 🙏 Acknowledgments

- Inspired by Google's Mantis security review framework
- Built with modern web technologies
- Powered by advanced AI language models
- Design inspired by modern SaaS applications

## 🎯 Roadmap

- [ ] Multi-agent collaboration
- [ ] Custom tool creation
- [ ] Export audit reports
- [ ] Integration with CI/CD pipelines
- [ ] Support for more LLM providers
- [ ] Advanced visualization options
- [ ] Collaborative auditing features

---

**Built with ❤️ using React, TypeScript, and AI**
