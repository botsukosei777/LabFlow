const fs = require('fs');

// Patch Sidebar.tsx
let sidebarStr = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
sidebarStr = sidebarStr.replace("  Book,\n  FileText,", "  Book,\n  BarChart2,\n  FileText,");
sidebarStr = sidebarStr.replace("{ path: '/notebook', icon: Book, labelKey: 'nav.notebook' },\n  { path: '/milestones', icon: Target, labelKey: 'nav.milestones' },",
  "{ path: '/notebook', icon: Book, labelKey: 'nav.notebook' },\n  { path: '/analysis', icon: BarChart2, labelKey: 'nav.analysis', fallbackLabel: '分析' },\n  { path: '/milestones', icon: Target, labelKey: 'nav.milestones' },");
fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebarStr);
