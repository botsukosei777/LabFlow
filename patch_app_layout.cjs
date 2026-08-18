const fs = require('fs');

// Patch App.tsx
let appStr = fs.readFileSync('src/App.tsx', 'utf8');
appStr = appStr.replace("const Notebook = lazy(() => import('./pages/Notebook'));",
  "const Notebook = lazy(() => import('./pages/Notebook'));\nconst Analysis = lazy(() => import('./pages/Analysis'));");
appStr = appStr.replace('<Route path="/notebook" element={<Notebook />} />',
  '<Route path="/notebook" element={<Notebook />} />\n                    <Route path="/analysis" element={<Analysis />} />');
fs.writeFileSync('src/App.tsx', appStr);

// Patch Layout.tsx
let layoutStr = fs.readFileSync('src/components/layout/Layout.tsx', 'utf8');
layoutStr = layoutStr.replace("import { \n  Calendar as CalendarIcon,\n  FlaskConical,\n  CheckSquare,\n  BookOpen,\n  Target,\n  Package,\n  Settings,\n  LogOut,\n  Menu,\n  X,\n  Moon,\n  Sun,\n  Users,\n  Vote\n} from 'lucide-react';",
  "import { \n  Calendar as CalendarIcon,\n  FlaskConical,\n  CheckSquare,\n  BookOpen,\n  BarChart2,\n  Target,\n  Package,\n  Settings,\n  LogOut,\n  Menu,\n  X,\n  Moon,\n  Sun,\n  Users,\n  Vote\n} from 'lucide-react';");

layoutStr = layoutStr.replace("{ path: '/notebook', icon: BookOpen, label: t('nav.notebook') },\n    { path: '/milestones', icon: Target, label: t('nav.milestones') },",
  "{ path: '/notebook', icon: BookOpen, label: t('nav.notebook') },\n    { path: '/analysis', icon: BarChart2, label: t('nav.analysis', '分析') },\n    { path: '/milestones', icon: Target, label: t('nav.milestones') },");

fs.writeFileSync('src/components/layout/Layout.tsx', layoutStr);
