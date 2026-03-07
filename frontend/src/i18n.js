const STRINGS = {
  landing: {
    title: 'VidInsight',
    subtitle: 'Video Insight - AI驱动的YouTube视频分析工具',
    urlPlaceholder: 'Paste a YouTube video URL...',
    analyzeBtn: 'Analyze',
    recentTitle: 'Recent Analyses',
    empty: 'No analyses yet. Paste a URL above to get started.',
    analyzingTitle: 'Analyzing video and generating highlights',
  },

  analyze: {
    backToHome: 'Back',
    analyzing: 'Analyzing...',
    stageFetching: 'Fetching video data...',
    stageGenerating: 'Generating highlights...',
    stageProcessing: 'Processing summary...',
    loadingCached: 'Loading cached analysis...',
    errorTitle: 'Analysis Failed',
    retry: 'Try Again',
  },

  tabs: {
    summary: 'Summary',
    chat: 'Chat',
    transcript: 'Transcript',
    notes: 'Notes',
  },

  video: {
    topicsTitle: 'HIGHLIGHTS',
    takeawaysTitle: 'KEY TAKEAWAYS',
    themesTitle: 'THEMES',
    exploringTheme: 'Exploring theme...',
    chatTitle: 'Ask about this video',
    suggestedQuestions: 'Suggested questions:',
    chatPlaceholder: 'Ask a question about this video... (Enter to send)',
    chatDisabled: 'Analyze a video first to start chatting',
    modelFixed: 'Model is locked for this conversation',
    selectModel: 'Select model',
    noModel: 'No models available',
    playAll: 'Play All',
    stop: 'Stop',
    generatingReels: 'Generating your highlights...',
    searchPlaceholder: 'Search transcript...',
    noResults: 'No matches found',
    overallHighlights: 'Overall highlights',
    auto: 'Auto',
    manual: 'Manual',
    jumpToCurrent: 'Jump to Current',
    searchTranscript: 'Search transcript',
    original: 'Original',
    translating: 'Translating...',
  },

  notes: {
    emptyState: 'No notes yet. Add a note to capture your thoughts.',
    addNote: 'Add Note',
    placeholder: 'Add context or your own takeaway (optional)',
    captureTimestamp: 'Capture Timestamp',
    sourceTranscript: 'Transcript',
    sourceChat: 'Chat',
    sourceSummary: 'Summary',
    sourceCustom: 'Custom',
    save: 'Save',
    cancel: 'Cancel',
    deleteConfirm: 'Delete this note?',
    selectedSnippet: 'SELECTED SNIPPET',
    yourNote: 'YOUR NOTE',
    enhanceWithAi: 'Enhance with AI',
    enhanceHint: 'Removes filler words & typos',
    enhancing: 'Enhancing...',
  },

  selection: {
    explain: 'Explain',
    takeNote: 'Take Notes',
  },

  export: {
    title: 'Export Transcript',
    formatLabel: 'Format',
    settingsLabel: 'Settings',
    includeTimestamps: 'Include timestamps',
    requiredForSrt: '(required for SRT)',
    download: 'Download',
  },

  message: {
    you: 'You',
    copyCode: 'Copy code',
    copied: 'Copied',
    copy: 'Copy',
    pastedContent: 'Pasted content',
    kb: 'KB',
    lines: 'lines',
    generatedImage: 'Generated image',
  },

  api: {
    requestFailed: (status) => `Request failed with status ${status}`,
    streamingFailed: 'Streaming response failed',
    streamingEmpty: 'Streaming response body is empty',
  },

  common: {
    retry: 'Retry',
    confirm: 'Confirm',
    cancel: 'Cancel',
    error: 'Error',
    loadingInit: 'Loading...',
  },
};

export default STRINGS;
