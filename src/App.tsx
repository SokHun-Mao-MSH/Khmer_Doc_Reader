import { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  signOut, 
  User 
} from 'firebase/auth';
import { auth, googleProvider } from './lib/firebase';
import { Folder, Lesson } from './types';
import { cn } from './lib/utils';
import { Sidebar } from './components/Sidebar';
import { DocViewer } from './components/DocViewer';
import { Editor } from './components/Editor';
import { translations, Language } from './i18n';
import { GoogleGenAI } from "@google/genai";
import { 
  LogOut, 
  LogIn, 
  BookOpen, 
  Edit3, 
  Plus, 
  Share2, 
  Layout, 
  ShieldCheck, 
  Globe,
  Loader2,
  ChevronRight,
  ChevronDown,
  Download,
  Languages,
  Monitor,
  X,
  Check,
  Copy,
  Lock,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function App() {
  type LessonSnapshot = {
    id: string;
    lessonId: string;
    ownerId: string;
    title: string;
    content: string;
    triggerType: string;
    createdAt: string;
  };
  type ExportPageSize = 'a5' | 'a4' | 'a3' | 'a2' | 'letter' | 'legal' | 'tabloid';

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const exportPageOptions: Array<{ key: ExportPageSize; label: string; width: number; height: number }> = [
    { key: 'a5', label: 'A5', width: 559, height: 794 },
    { key: 'a4', label: 'A4', width: 794, height: 1123 },
    { key: 'a3', label: 'A3', width: 1123, height: 1587 },
    { key: 'a2', label: 'A2', width: 1587, height: 2245 },
    { key: 'letter', label: 'Letter', width: 816, height: 1056 },
    { key: 'legal', label: 'Legal', width: 816, height: 1344 },
    { key: 'tabloid', label: 'Tabloid', width: 1056, height: 1632 },
  ];
  const getPageDimensions = (size: ExportPageSize) =>
    exportPageOptions.find((opt) => opt.key === size) || exportPageOptions[1];
  const [exportSettings, setExportSettings] = useState({
    pageSize: 'a4' as ExportPageSize,
    orientation: 'portrait' as 'portrait' | 'landscape',
    margins: 20,
    startPage: 1,
    endPage: 1,
    useCustomRange: false,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [lang, setLang] = useState<Language>('kh');
  const [fontSize, setFontSize] = useState(14);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareAccess, setShareAccess] = useState<'anyone' | 'restricted'>('anyone');
  const [shareRole, setShareRole] = useState<'viewer' | 'commenter' | 'editor'>('viewer');
  const [translateTarget, setTranslateTarget] = useState('en');
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [lessonSnapshots, setLessonSnapshots] = useState<LessonSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(null);
  const [navigateToText, setNavigateToText] = useState<string | null>(null);
  const [navigateToSeq, setNavigateToSeq] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarResizeRafRef = useRef<number | null>(null);
  const pendingSidebarWidthRef = useRef(300);
  const translateMenuRef = useRef<HTMLDivElement | null>(null);

  const t = translations[lang];
  const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3001';

  const apiFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    });
    if (!response.ok) {
      const msg = await response.text();
      throw new Error(msg || `API error ${response.status}`);
    }
    if (response.status === 204) return null as T;
    return response.json() as Promise<T>;
  };

  const loadWorkspace = async (ownerId: string) => {
    const [folderList, lessonList] = await Promise.all([
      apiFetch<Folder[]>(`/api/folders?ownerId=${encodeURIComponent(ownerId)}`),
      apiFetch<Lesson[]>(`/api/lessons?ownerId=${encodeURIComponent(ownerId)}`),
    ]);

    setFolders(folderList);
    setLessons(lessonList);

    if (folderList.length === 0) {
      const sqlFolder = await apiFetch<Folder>('/api/folders', {
        method: 'POST',
        body: JSON.stringify({
          ownerId,
          name: t.sqlFolder,
          order: 0,
        }),
      });
      await apiFetch<Lesson>('/api/lessons', {
        method: 'POST',
        body: JSON.stringify({
          ownerId,
          folderId: sqlFolder.id,
          title: t.sqlLessonTitle,
          content: t.sqlLessonContent,
          order: 0,
        }),
      });

      const guideFolder = await apiFetch<Folder>('/api/folders', {
        method: 'POST',
        body: JSON.stringify({
          ownerId,
          name: t.guideFolder,
          order: 1,
        }),
      });
      await apiFetch<Lesson>('/api/lessons', {
        method: 'POST',
        body: JSON.stringify({
          ownerId,
          folderId: guideFolder.id,
          title: t.guideTitle,
          content: t.guideContent,
          order: 0,
        }),
      });
      await apiFetch<Lesson>('/api/lessons', {
        method: 'POST',
        body: JSON.stringify({
          ownerId,
          folderId: guideFolder.id,
          title: t.advancedGuideTitle,
          content: t.advancedGuideContent,
          order: 1,
        }),
      });
      await loadWorkspace(ownerId);
    }
  };

  useEffect(() => {
    // Update total pages estimate when settings change
    const element = document.getElementById('document-to-export');
    if (element && showExportModal) {
      const calculatePages = async () => {
        const tempIframe = document.createElement('iframe');
        tempIframe.style.position = 'fixed';
        tempIframe.style.left = '-9999px';
        tempIframe.style.visibility = 'hidden';
        document.body.appendChild(tempIframe);
        
        const iframeDoc = tempIframe.contentDocument || tempIframe.contentWindow?.document;
        if (iframeDoc) {
          const selectedDims = getPageDimensions(exportSettings.pageSize);
          const printWidth = exportSettings.orientation === 'portrait' ? selectedDims.width : selectedDims.height;
          const html = `
            <html><body style="margin:0;padding: ${exportSettings.margins}px ${exportSettings.margins + 2}px; width:${printWidth}px; font-family:sans-serif;">
              ${element.innerHTML}
            </body></html>
          `;
          iframeDoc.open();
          iframeDoc.write(html);
          iframeDoc.close();
          
          await new Promise(r => setTimeout(r, 100)); // wait for layout
          const contentHeight = iframeDoc.body.scrollHeight;
          const pageHeights = exportPageOptions.reduce<Record<ExportPageSize, number>>((acc, opt) => {
            acc[opt.key] = exportSettings.orientation === 'portrait' ? opt.height : opt.width;
            return acc;
          }, {} as Record<ExportPageSize, number>);
          // Adjust for internal scaling (roughly 1.33 px/pt for standard DPI)
          const adjustedPageHeight = pageHeights[exportSettings.pageSize] * 0.9; 
          const estimatedPages = Math.ceil(contentHeight / adjustedPageHeight) || 1;
          setTotalPages(estimatedPages);
          
          setExportSettings(s => {
            // Only update endPage if it was at the previous max or if it's currently beyond the new max
            const shouldUpdateEnd = !s.useCustomRange || s.endPage > estimatedPages || s.endPage === totalPages;
            return { 
              ...s, 
              endPage: shouldUpdateEnd ? estimatedPages : s.endPage 
            };
          });
        }
        document.body.removeChild(tempIframe);
      };
      calculatePages();
    }
  }, [showExportModal, exportSettings.pageSize, exportSettings.orientation, exportSettings.margins]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const minWidth = 240;
      const maxWidth = 520;
      pendingSidebarWidthRef.current = Math.max(minWidth, Math.min(maxWidth, e.clientX));
      if (sidebarResizeRafRef.current !== null) return;
      sidebarResizeRafRef.current = requestAnimationFrame(() => {
        setSidebarWidth(pendingSidebarWidthRef.current);
        sidebarResizeRafRef.current = null;
      });
    };
    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      if (sidebarResizeRafRef.current !== null) {
        cancelAnimationFrame(sidebarResizeRafRef.current);
        sidebarResizeRafRef.current = null;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (sidebarResizeRafRef.current !== null) {
        cancelAnimationFrame(sidebarResizeRafRef.current);
        sidebarResizeRafRef.current = null;
      }
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (!user) {
      setFolders([]);
      setLessons([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        await loadWorkspace(user.uid);
      } catch (e) {
        if (!cancelled) console.error('Load workspace failed:', e);
      }
    };
    run();

    const interval = window.setInterval(run, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user, lang]);

  const activeLesson = lessons.find(l => l.id === activeLessonId);
  const localizeSeedLabel = (value: string) => {
    if (!value) return value;
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const pairs: Array<[string, string, string[]?]> = [
      [translations.kh.sqlFolder, translations.en.sqlFolder],
      [translations.kh.guideFolder, translations.en.guideFolder],
      [translations.kh.sqlLessonTitle, translations.en.sqlLessonTitle],
      [translations.kh.guideTitle, translations.en.guideTitle],
      [translations.kh.advancedGuideTitle, translations.en.advancedGuideTitle],
      ['មគ្គុទ្ទេសក៍ប្រើប្រាស់', 'User Guide', ['មគ្គុទ្ទេសក៍', 'guide']],
      ['សង្ខេបមេរៀន sql set operators', 'SQL Set Operators & Functions Summary', ['set operators', 'sql']],
      ['ស្វាគមន៍មកកាន់ប្រព័ន្ធគ្រប់គ្រងមេរៀនឆ្លាតវៃ', 'Welcome to Smart Lesson Manager', ['smart lesson manager', 'ស្វាគមន៍']],
      ['មុខងារកម្រិតខ្ពស់ និងមានប្រយោជន៍បំផុត', 'Advanced & Useful Features', ['advanced useful', 'កម្រិតខ្ពស់']],
    ];
    const normalizedValue = normalize(value);
    for (const [khValue, enValue, aliases = []] of pairs) {
      const khNorm = normalize(khValue);
      const enNorm = normalize(enValue);
      const aliasMatch = aliases.some((alias) => normalizedValue.includes(normalize(alias)));
      const equalMatch = normalizedValue === khNorm || normalizedValue === enNorm;
      const looseMatch =
        (khNorm && normalizedValue.includes(khNorm)) ||
        (enNorm && normalizedValue.includes(enNorm)) ||
        aliasMatch;
      if (equalMatch || looseMatch) return lang === 'kh' ? khValue : enValue;
    }
    return value;
  };
  const uiFolders = folders.map((folder) => ({ ...folder, name: localizeSeedLabel(folder.name) }));
  const uiLessons = lessons.map((lesson) => ({ ...lesson, title: localizeSeedLabel(lesson.title) }));
  const translateLanguageOptions = [
    { code: 'en', label: 'English' },
    { code: 'kh', label: 'Khmer' },
    { code: 'vi', label: 'Vietnamese' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'fr', label: 'French' },
  ];

  const loadLessonSnapshots = async () => {
    if (!user || !activeLessonId) {
      setLessonSnapshots([]);
      return;
    }
    setLoadingSnapshots(true);
    try {
      const rows = await apiFetch<LessonSnapshot[]>(
        `/api/lessons/${activeLessonId}/snapshots?ownerId=${encodeURIComponent(user.uid)}&limit=40`
      );
      setLessonSnapshots(rows);
    } catch (e) {
      console.error('Load snapshots failed:', e);
      setLessonSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const restoreSnapshot = async (snapshotId: string) => {
    if (!user || !activeLessonId) return;
    setRestoringSnapshotId(snapshotId);
    try {
      const restored = await apiFetch<Lesson>(`/api/lessons/${activeLessonId}/restore/${snapshotId}`, {
        method: 'POST',
        body: JSON.stringify({ ownerId: user.uid }),
      });
      setLessons((prev) => prev.map((lesson) => (lesson.id === restored.id ? restored : lesson)));
      await loadLessonSnapshots();
    } catch (e) {
      console.error('Restore snapshot failed:', e);
    } finally {
      setRestoringSnapshotId(null);
    }
  };
  const handleSelectLesson = (id: string, focusText?: string) => {
    setActiveLessonId(id);
    if (focusText?.trim()) {
      setNavigateToText(focusText.trim());
      setNavigateToSeq((s) => s + 1);
    }
  };

  const handleDownloadPDF = async (settings: typeof exportSettings) => {
    if (!activeLesson) return;
    setIsExporting(true);
    
    try {
      const element = document.getElementById('document-to-export');
      if (!element) throw new Error('Export element not found');

      // 1. Create a hidden iframe for clean rendering
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      
      const selectedDims = getPageDimensions(settings.pageSize);
      const printWidth = settings.orientation === 'portrait' ? selectedDims.width : selectedDims.height;
      iframe.style.width = `${printWidth}px`;
      iframe.style.height = 'auto';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('Could not create export iframe');

      // 2. Prepare the clean content
      const safeTitle = (activeLesson.title || 'lesson').replace(/[/\\?%*:|"<>]/g, '-');
      const exportSource = document.createElement('div');
      exportSource.innerHTML = element.innerHTML;

      // Normalize interactive code blocks into plain <pre><code> for stable PDF output.
      exportSource.querySelectorAll('div.my-6.overflow-hidden.rounded-2xl').forEach((block) => {
        const pre = block.querySelector('pre');
        if (!pre) return;
        const normalizedPre = document.createElement('pre');
        const normalizedCode = document.createElement('code');
        normalizedCode.textContent = pre.textContent || '';
        normalizedPre.appendChild(normalizedCode);
        block.replaceWith(normalizedPre);
      });

      // Safety cleanup: remove accidental interactive controls from exported content.
      exportSource
        .querySelectorAll('button,[role="button"],[aria-label*="Copy"],[aria-label*="Download"]')
        .forEach((el) => el.remove());
      // Follow user-selected text size directly for PDF export
      const basePdfSize = Math.max(8, fontSize);
      const h1PdfSize = basePdfSize * 1.45;
      const h2PdfSize = basePdfSize * 1.22;
      const h3PdfSize = basePdfSize * 1.1;
      const chapterLabel = lang === 'kh' ? 'ជំពូក 1' : 'Chapter 1';

      // We'll use a very basic stylesheet with NO oklch
      const cleanHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;500;700&family=Noto+Serif:wght@400;600;700&family=Noto+Serif+Khmer:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body { 
              background: white; 
              margin: 0; 
              padding: 0;
              font-family: "Noto Serif Khmer", "Noto Serif", "Times New Roman", serif;
              color: #111827;
              -webkit-font-smoothing: antialiased;
              font-size: ${basePdfSize}px;
            }
            #export-wrapper {
              width: ${printWidth}px;
              margin: 0 auto;
              padding: ${settings.margins}px ${settings.margins + 2}px;
              background: white;
              box-sizing: border-box;
            }
            .running-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: ${Math.max(9, basePdfSize * 0.78)}px;
              font-weight: 700;
              border-bottom: 1px solid #111827;
              padding-bottom: 5px;
              margin-bottom: 10px;
            }
            .chapter-title {
              text-align: center;
              font-size: ${h1PdfSize * 0.84}px;
              font-weight: 700;
              margin: 8px 0 2px;
              padding-bottom: 4px;
              border-bottom: 1.5px solid #111827;
            }
            .doc-meta {
              text-align: center;
              font-size: ${Math.max(8, basePdfSize * 0.78)}px;
              color: #4b5563;
              margin: 0 0 12px;
              font-weight: 500;
            }
            #content { 
              line-height: 1.58;
            }
            #content div, #content p {
              margin: 0 0 8px;
            }
            #content br {
              line-height: 1.35;
            }
            h1 { 
              font-size: ${h1PdfSize * 0.74}px; 
              font-weight: 700; 
              margin: 14px 0 6px; 
              color: #111827; 
              text-decoration: underline;
              text-underline-offset: 3px;
            }
            h2 { 
              font-size: ${h2PdfSize * 0.82}px; 
              font-weight: 700; 
              margin-top: 12px; 
              margin-bottom: 6px; 
              color: #1f2937;
            }
            h3 { font-size: ${h3PdfSize * 0.82}px; font-weight: 700; margin-top: 10px; margin-bottom: 5px; color: #374151; }
            p { 
              margin: 0 0 7px; 
              font-size: ${Math.max(10, basePdfSize - 0.2)}px; 
              color: #111827; 
              text-align: justify;
              text-indent: 1.2em;
            }
            
            code { 
              background: #f3f4f6; 
              padding: 2px 0.4em; 
              border-radius: 4px; 
              font-family: "Courier New", monospace; 
              font-size: 0.84em; 
              color: #111827;
              white-space: pre-wrap;
              word-break: break-word;
              overflow-wrap: anywhere;
            }
            pre { 
              background: #f9fafb; 
              padding: 10px; 
              border-radius: 8px; 
              border: 1px solid #d1d5db; 
              margin: 20px 0;
              overflow: visible !important;
              font-family: "Courier New", monospace;
              font-size: 11px;
              line-height: 1.45;
              white-space: pre-wrap !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            pre code {
              white-space: pre-wrap !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
              display: block;
              padding: 0;
              background: transparent;
              font-size: inherit;
            }
            #content pre * {
              white-space: pre-wrap !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            #content pre,
            #content pre *,
            #content code {
              max-width: 100% !important;
            }
            #content .overflow-x-auto,
            #content [style*="overflow-x"],
            #content [style*="overflow: auto"],
            #content [style*="overflow:auto"] {
              overflow: visible !important;
            }
            blockquote { 
              border-left: 3px solid #6b7280; 
              padding: 8px 14px; 
              margin: 16px 0; 
              color: #374151; 
              background: #f9fafb;
            }
            table { 
              width: 100%; 
              border-collapse: collapse;
              margin: 18px 0; 
              border: 1px solid #111827; 
              overflow: hidden;
            }
            th, td { 
              padding: 8px 10px; 
              border: 1px solid #111827; 
              text-align: left; 
              font-size: ${Math.max(10, basePdfSize * 0.82)}px;
            }
            th { 
              background-color: #f3f4f6; 
              color: #111827; 
              font-weight: 700; 
            }
            ul, ol { margin: 4px 0 10px; padding-left: 26px; }
            li { margin-bottom: 4px; color: #111827; font-size: ${Math.max(10, basePdfSize - 0.2)}px; }
            
            .katex-display { margin: 16px 0; padding: 10px; background: #fff; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div id="export-wrapper">
            <div class="running-header">
               <div>${lang === 'kh' ? 'មេរៀនបច្ចេកទេស' : 'Technical Lesson Document'}</div>
               <div>${chapterLabel} · ${safeTitle}</div>
            </div>
            <div class="chapter-title">${chapterLabel}: ${activeLesson.title}</div>
            <div class="doc-meta">${new Date().toLocaleDateString()} • ${lang === 'kh' ? 'ឯកសារសិក្សា' : 'Study Document'}</div>
            <div id="content">${exportSource.innerHTML}</div>
          </div>
        </body>
        </html>
      `;

      iframeDoc.open();
      iframeDoc.write(cleanHtml);
      iframeDoc.close();

      // 3. Wait for content to load (fonts and images)
      await new Promise(resolve => setTimeout(resolve, 800));
      if ('fonts' in iframeDoc) {
        await (iframeDoc as any).fonts.ready;
      }

      const contentToExport = iframeDoc.getElementById('export-wrapper');
      if (!contentToExport) throw new Error('Iframe content not found');

      const pdf = new jsPDF({
        orientation: settings.orientation as any,
        unit: 'px',
        format: settings.pageSize
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // 4. Render page-by-page to avoid clipping/warping on long documents
      const exportWidthPx = Math.ceil(contentToExport.scrollWidth);
      const totalHeightPx = Math.ceil(contentToExport.scrollHeight);
      const pageHeightPx = Math.max(1, Math.floor((pdfHeight * exportWidthPx) / pdfWidth));
      const totalPagesCalculated = Math.max(1, Math.ceil(totalHeightPx / pageHeightPx));

      const start = settings.useCustomRange ? Math.max(1, settings.startPage) : 1;
      const end = settings.useCustomRange ? Math.min(totalPagesCalculated, settings.endPage) : totalPagesCalculated;
      const scale = 2;
      const sourceHtml = contentToExport.innerHTML;

      for (let i = start - 1; i < end; i++) {
        const offsetY = i * pageHeightPx;
        const currentPageHeightPx = Math.min(pageHeightPx, Math.max(1, totalHeightPx - offsetY));

        const pageViewport = iframeDoc.createElement('div');
        pageViewport.style.width = `${exportWidthPx}px`;
        pageViewport.style.height = `${currentPageHeightPx}px`;
        pageViewport.style.overflow = 'hidden';
        pageViewport.style.position = 'relative';
        pageViewport.style.background = '#ffffff';

        const shiftedContent = iframeDoc.createElement('div');
        shiftedContent.style.width = `${exportWidthPx}px`;
        shiftedContent.style.transform = `translateY(-${offsetY}px)`;
        shiftedContent.innerHTML = sourceHtml;
        pageViewport.appendChild(shiftedContent);
        iframeDoc.body.appendChild(pageViewport);

        const canvas = await html2canvas(pageViewport, {
          scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: exportWidthPx,
          height: currentPageHeightPx,
          windowWidth: exportWidthPx,
          windowHeight: currentPageHeightPx
        });

        iframeDoc.body.removeChild(pageViewport);

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imageRenderHeight = (canvas.height * pdfWidth) / canvas.width;

        if (i > start - 1) {
          pdf.addPage(settings.pageSize as any, settings.orientation as any);
        }

        pdf.addImage(
          imgData,
          'JPEG',
          0,
          0,
          pdfWidth,
          imageRenderHeight,
          undefined,
          'FAST'
        );

        const pageLabel = `${i + 1}`;
        pdf.setFont('times', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(90, 90, 90);
        pdf.text(pageLabel, pdfWidth - 24, pdfHeight - 12, { align: 'right' });
      }

      pdf.save(`${safeTitle}.pdf`);

      // 5. Cleanup
      document.body.removeChild(iframe);
    } catch (error) {
      console.error('PDF Export failed:', error);
      const errorMsg = lang === 'kh' ? 'បរាជ័យក្នុងការទាញយក PDF។ សូមព្យាយាមម្ដងទៀត។' : 'Failed to download PDF. Please try again.';
      alert(errorMsg);
    } finally {
      setIsExporting(false);
      setShowExportModal(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      const code = error?.code || '';
      console.error('Login error:', error);

      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        try {
          // Fallback for browsers/environments that block popup auth windows
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError: any) {
          console.error('Redirect login error:', redirectError);
          alert(
            lang === 'kh'
              ? 'មិនអាចចូលដោយ Redirect បានទេ។ សូមពិនិត្យ Internet ហើយសាកល្បងម្តងទៀត។'
              : 'Redirect login failed. Please check your internet and try again.'
          );
          return;
        }
      }

      if (code === 'auth/unauthorized-domain') {
        alert(
          lang === 'kh'
            ? 'Domain នេះមិនទាន់បានអនុញ្ញាតក្នុង Firebase Authentication។ សូមបន្ថែម localhost នៅ Authorized domains។'
            : 'This domain is not authorized in Firebase Authentication. Please add localhost to Authorized domains.'
        );
        return;
      }

      alert(
        lang === 'kh'
          ? `Login បរាជ័យ (${code || 'unknown'}). សូមព្យាយាមម្តងទៀត។`
          : `Login failed (${code || 'unknown'}). Please try again.`
      );
    }
  };

  const handleLogout = () => signOut(auth);

  const addFolder = async () => {
    if (!user) return;
    const defaultName = lang === 'kh' ? 'ផ្ទាំង ' : 'Tab ';
    const name = window.prompt(t.enterTabName, defaultName + (folders.length + 1));
    if (!name) return;
    try {
      const newFolder = await apiFetch<Folder>('/api/folders', {
        method: 'POST',
        body: JSON.stringify({
          name,
          ownerId: user.uid,
          order: folders.length,
        }),
      });
      setFolders((prev) => [...prev, newFolder].sort((a, b) => a.order - b.order));
    } catch (e) {
      console.error(e);
      alert(t.errorCreatingTab);
    }
  };

  const addLesson = async (folderId: string) => {
    if (!user) return;
    try {
      const newLesson = await apiFetch<Lesson>('/api/lessons', {
        method: 'POST',
        body: JSON.stringify({
          folderId,
          title: t.newLessonTitle,
          content: t.newLessonContent,
          ownerId: user.uid,
          order: lessons.filter(l => l.folderId === folderId).length,
        }),
      });
      setLessons((prev) => [...prev, newLesson].sort((a, b) => a.order - b.order));
      setActiveLessonId(newLesson.id);
      setIsEditing(true);
    } catch (e) {
      console.error(e);
      alert(t.errorCreatingLesson);
    }
  };

  const handleReorderLessons = async (lessonIds: string[], folderId: string) => {
    if (!user) return;
    try {
      await apiFetch<{ ok: boolean }>('/api/lessons/reorder', {
        method: 'POST',
        body: JSON.stringify({
          ownerId: user.uid,
          folderId,
          lessonIds,
        }),
      });
      setLessons((prev) =>
        prev.map((lesson) => {
          const idx = lessonIds.indexOf(lesson.id);
          if (lesson.folderId === folderId && idx >= 0) return { ...lesson, order: idx };
          return lesson;
        })
      );
    } catch (e) {
      console.error("Reorder error:", e);
    }
  };

  const saveLesson = async (title: string, content: string, isAuto = false) => {
    if (!activeLessonId) return;
    try {
      await apiFetch<Lesson>(`/api/lessons/${activeLessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content,
          createSnapshot: isAuto,
          triggerType: isAuto ? 'autosave' : 'manual',
        }),
      });
      setLessons((prev) =>
        prev.map((lesson) => (lesson.id === activeLessonId ? { ...lesson, title, content } : lesson))
      );
      if (!isAuto) setIsEditing(false);
    } catch (e) {
      console.error(e);
      if (!isAuto) alert(t.errorSavingLesson);
    }
  };

  const handleTranslateContent = async (targetCode?: string) => {
    if (!activeLesson || isTranslating) return;
    setIsTranslating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const resolvedCode = targetCode || translateTarget;
      const languageByCode: Record<string, string> = {
        en: 'English',
        kh: 'Khmer',
        vi: 'Vietnamese',
        zh: 'Chinese',
        ja: 'Japanese',
        ko: 'Korean',
        fr: 'French',
      };
      const targetLang = languageByCode[resolvedCode] || 'English';
      
      const prompt = `Translate this Markdown document to ${targetLang}.
Keep Markdown structure, headings, lists, code fences, tables, and inline code exactly.
Translate only human-readable text.
Return ONLY the translated Markdown content, no explanations.

${activeLesson.content}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a professional translator specialized in technical documentation and Markdown.",
          temperature: 0.2,
        }
      });

      const translatedText = (response.text || '').trim();
      if (!translatedText) throw new Error('No translated text returned');

      await apiFetch<Lesson>(`/api/lessons/${activeLesson.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content: translatedText,
        }),
      });
      setLessons((prev) =>
        prev.map((lesson) => (lesson.id === activeLesson.id ? { ...lesson, content: translatedText } : lesson))
      );
    } catch (e) {
      console.error("Translation failed:", e);
      alert(lang === 'kh' ? 'បកប្រែបរាជ័យ។ សូមសាកជាថ្មី ឬប្ដូរភាសាគោលដៅ។' : 'Failed to translate content. Try again or change target language.');
    } finally {
      setIsTranslating(false);
    }
  };

  const deleteFolder = async (id: string) => {
    if (!confirm(t.deleteTabConfirm)) return;
    try {
      await apiFetch<null>(`/api/folders/${id}`, { method: 'DELETE' });
      setFolders((prev) => prev.filter((folder) => folder.id !== id));
      setLessons((prev) => prev.filter((lesson) => lesson.folderId !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const updateFolder = async (id: string, name: string) => {
    try {
      const next = await apiFetch<Folder>(`/api/folders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setFolders((prev) => prev.map((folder) => (folder.id === id ? next : folder)));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteLesson = async (id: string) => {
    if (!confirm(t.deleteLessonConfirm)) return;
    try {
      await apiFetch<null>(`/api/lessons/${id}`, { method: 'DELETE' });
      setLessons((prev) => prev.filter((lesson) => lesson.id !== id));
      if (activeLessonId === id) setActiveLessonId(null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!translateMenuRef.current) return;
      if (!translateMenuRef.current.contains(e.target as Node)) {
        setShowTranslateMenu(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!showHistoryModal) return;
    loadLessonSnapshots();
  }, [showHistoryModal, activeLessonId, user?.uid]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-white font-sans">
        <nav className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2 text-white shadow-lg shadow-blue-200">
               <BookOpen size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800">{t.appTitle}</span>
          </div>
          <button
            onClick={handleLogin}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-6 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:shadow-sm"
          >
            <LogIn size={18} />
            {lang === 'kh' ? 'ចូលប្រើប្រាស់' : 'Login'}
          </button>
        </nav>

        <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-50/50 via-transparent to-transparent">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl"
          >
             <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
                <Globe size={14} />
                {t.infiniteKnowledge}
             </div>
            <h1 className="mb-8 text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl">
              {t.tagline} <br />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">{t.taglineHighlight}</span>
            </h1>
            <p className="mb-12 text-lg leading-relaxed text-slate-600 max-w-2xl mx-auto">
              {lang === 'kh' 
                ? 'ប្រព័ន្ធគ្រប់គ្រងមេរៀន និងឯកសារបង្រៀន ដែលគាំទ្រភាសាខ្មែរពេញលេញ។ សរសេរ កែសម្រួល និងចែករំលែកចំណេះដឹងនៅគ្រប់ទីកន្លែង។' 
                : 'A comprehensive lesson and documentation management system with full support for multiple languages. Write, edit, and share knowledge anywhere.'}
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              <button
                onClick={handleLogin}
                className="group relative flex items-center gap-3 rounded-2xl bg-slate-900 px-10 py-5 text-lg font-bold text-white shadow-2xl transition-all hover:-translate-y-1 hover:bg-slate-800"
              >
                {t.startFree}
                <div className="rounded-full bg-white/10 p-1 transition-transform group-hover:translate-x-1">
                  <ChevronRight size={20} />
                </div>
              </button>
              
              <div className="flex flex-col items-start gap-4 p-5 rounded-2xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-200/50">
                 <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-50 p-2 text-green-600">
                       <ShieldCheck size={20} />
                    </div>
                    <div className="text-left">
                       <div className="text-sm font-bold text-slate-900">{t.cloudStorage}</div>
                       <div className="text-xs text-slate-500">{t.cloudDesc}</div>
                    </div>
                 </div>
              </div>
            </div>
          </motion.div>
          
          <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
             {[
               { icon: <Layout />, title: t.feature1Title, desc: t.feature1Desc },
               { icon: <Edit3 />, title: t.feature2Title, desc: t.feature2Desc },
               { icon: <Share2 />, title: t.feature3Title, desc: t.feature3Desc }
             ].map((feature, i) => (
               <div key={i} className="p-8 rounded-3xl border border-slate-100 bg-white/50 backdrop-blur-sm transition-all hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/5">
                  <div className="mb-6 inline-flex rounded-2xl bg-blue-50 p-4 text-blue-600">
                    {feature.icon}
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-slate-900">{feature.title}</h3>
                  <p className="text-slate-500 leading-relaxed">{feature.desc}</p>
               </div>
             ))}
          </div>
        </main>
        
        <footer className="py-12 border-t border-slate-50 text-center">
           <p className="text-slate-400 text-sm font-medium">
             © 2026 {t.appTitle} — {lang === 'kh' ? 'បង្កើតឡើងសម្រាប់គ្រូបង្រៀន' : 'Built for Teachers'}
           </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] font-sans overflow-hidden">
      <div className="relative h-full shrink-0" style={{ width: `${sidebarWidth}px` }}>
        <Sidebar
          folders={uiFolders}
          lessons={uiLessons}
          activeLessonId={activeLessonId}
          onSelectLesson={handleSelectLesson}
          onAddFolder={addFolder}
          onAddLesson={addLesson}
          onDeleteFolder={deleteFolder}
          onUpdateFolder={updateFolder}
          onDeleteLesson={deleteLesson}
          onReorderLessons={handleReorderLessons}
          t={t}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => setIsResizingSidebar(true)}
          className={cn(
            "absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-blue-200/60 transition-colors",
            isResizingSidebar && "bg-blue-300/70"
          )}
          title={lang === 'kh' ? 'ទាញដើម្បីប្ដូរទំហំ Sidebar' : 'Drag to resize sidebar'}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 lg:px-5 z-10">
          <div className="flex min-w-0 items-center gap-2">
            {activeLesson && (
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                <BookOpen size={16} />
                <span className="hidden sm:inline font-medium truncate max-w-[120px]">{uiFolders.find(f => f.id === activeLesson.folderId)?.name}</span>
                <ChevronRight size={12} className="text-slate-200 hidden sm:inline" />
                <span className="font-bold text-slate-800 truncate max-w-[220px] lg:max-w-[320px]">{localizeSeedLabel(activeLesson.title)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setLang('kh')}
                className={cn(
                  "px-2 py-1 text-[11px] font-bold rounded-md transition-all",
                  lang === 'kh' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                KH
              </button>
              <button
                onClick={() => setLang('en')}
                className={cn(
                  "px-2 py-1 text-[11px] font-bold rounded-md transition-all",
                  lang === 'en' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                EN
              </button>
            </div>

            {activeLesson && !isEditing && (
              <div className="flex items-center gap-2">
                <div ref={translateMenuRef} className="relative">
                  <button
                    onClick={() => !isTranslating && setShowTranslateMenu((s) => !s)}
                    disabled={isTranslating}
                    className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50"
                    title={t.translate}
                  >
                    {isTranslating ? <Loader2 size={15} className="animate-spin text-blue-500" /> : <Languages size={15} className="text-blue-500" />}
                    <span className="hidden xl:inline">
                      {isTranslating ? t.translating : `${t.translate}: ${translateLanguageOptions.find((o) => o.code === translateTarget)?.label || 'English'}`}
                    </span>
                    <ChevronDown size={14} className={cn("text-slate-400 transition-transform", showTranslateMenu && "rotate-180")} />
                  </button>
                  {showTranslateMenu && !isTranslating && (
                    <div className="absolute left-0 top-full mt-1 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-xl z-30 py-1">
                      {translateLanguageOptions.map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          onClick={async () => {
                            setTranslateTarget(option.code);
                            setShowTranslateMenu(false);
                            await handleTranslateContent(option.code);
                          }}
                          className={cn(
                            "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
                            translateTarget === option.code ? "text-blue-700 font-semibold" : "text-slate-700"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowExportModal(true)}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50"
                  title={t.downloadPdf}
                >
                  {isExporting ? <Loader2 size={15} className="animate-spin text-blue-500" /> : <Download size={15} className="text-red-500" />}
                  <span className="hidden xl:inline">{t.downloadPdf}</span>
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
                >
                  <Edit3 size={15} className="text-blue-500" />
                  <span className="hidden xl:inline">{t.edit}</span>
                </button>
              </div>
            )}
            <div className="h-5 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden lg:block">
                <p className="text-[11px] font-bold text-slate-900 leading-tight">{user.displayName}</p>
              </div>
              <img src={user.photoURL || ''} className="h-8 w-8 rounded-lg ring-2 ring-slate-100 shadow-sm object-cover" alt="" referrerPolicy="no-referrer" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 hover:border-red-100"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeLesson ? (
              isEditing ? (
                <Editor
                  initialTitle={activeLesson.title}
                  initialContent={activeLesson.content}
                  onSave={saveLesson}
                  onExitEditMode={() => setIsEditing(false)}
                  t={t}
                  lang={lang}
                  fontSize={fontSize}
                  onShowShare={() => setShowShareModal(true)}
                  onShowHistory={() => setShowHistoryModal(true)}
                  navigateToText={navigateToText || undefined}
                  navigateToSeq={navigateToSeq}
                />
              ) : (
                <motion.div
                  key={activeLesson.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.2 }}
                >
                    <DocViewer
                      content={activeLesson.content}
                      fontSize={fontSize}
                      navigateToText={navigateToText || undefined}
                      navigateToSeq={navigateToSeq}
                    />
                </motion.div>
              )
            ) : (
              <div className="p-8 lg:p-12 mx-auto max-w-5xl">
                <div className="mb-12 flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t.documentTabs}</h1>
                    <p className="text-slate-500 mt-2">{lang === 'kh' ? 'ទិដ្ឋភាពទូទៅនៃមេរៀនទាំងអស់របស់អ្នក' : 'Overview of all your lessons'}</p>
                  </div>
                  <button 
                    onClick={addFolder}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
                  >
                    <Plus size={20} />
                    {lang === 'kh' ? 'បង្កើត Tab ថ្មី' : 'Create New Tab'}
                  </button>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">{lang === 'kh' ? 'ឈ្មោះមេរៀន' : 'Lesson Title'}</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">{lang === 'kh' ? 'ស្ថិតក្នុង Tab' : 'In Tab'}</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">{lang === 'kh' ? 'សកម្មភាព' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {uiFolders.map(folder => {
                        const folderLessons = uiLessons.filter(l => l.folderId === folder.id);
                        if (folderLessons.length === 0) return null;
                        
                        return folderLessons.map((lesson) => (
                          <tr key={lesson.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => setActiveLessonId(lesson.id)}
                                className="text-[15px] font-semibold text-slate-800 hover:text-blue-600 transition-colors text-left"
                              >
                                {lesson.title}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-[11px] font-bold text-blue-600">
                                <Layout size={10} />
                                {folder.name}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => {
                                  setActiveLessonId(lesson.id);
                                  setIsEditing(true);
                                }}
                                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                              >
                                <Edit3 size={16} />
                              </button>
                            </td>
                          </tr>
                        ));
                      })}
                      {lessons.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center gap-3">
                              <BookOpen size={40} className="text-slate-200" />
                              <p>{lang === 'kh' ? 'មិនទាន់មានមេរៀននៅឡើយទេ' : 'No lessons created yet'}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {showShareModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden"
              >
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                   <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                        <Lock size={20} />
                      </div>
                      {t.sharing}
                   </h2>
                   <button onClick={() => setShowShareModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                      <X size={20} />
                   </button>
                </div>
                <div className="p-8 space-y-6">
                   <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-500">{lang === 'kh' ? 'តំណភ្ជាប់ទៅកាន់ឯកសារនេះ៖' : 'Link to this document:'}</p>
                      <div className="flex gap-2">
                         <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 font-medium truncate">
                           {window.location.origin}/lesson/{activeLessonId}?access={shareAccess}&role={shareRole}
                         </div>
                         <button 
                           onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/lesson/${activeLessonId}?access=${shareAccess}&role=${shareRole}`);
                             setLinkCopied(true);
                             setTimeout(() => setLinkCopied(false), 2000);
                           }}
                           className="flex items-center gap-2 bg-blue-600 text-white px-6 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all active:scale-95"
                         >
                            {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                            {linkCopied ? t.linkCopied : t.copyLink}
                         </button>
                      </div>
                   </div>
                   
                   <div className="pt-4 border-t border-slate-50 grid grid-cols-1 gap-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600">
                          <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                            {lang === 'kh' ? 'សិទ្ធិចូលមើល' : 'Access'}
                          </span>
                          <div className="relative">
                            <select
                              value={shareAccess}
                              onChange={(e) => setShareAccess(e.target.value as 'anyone' | 'restricted')}
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                              <option value="anyone">{lang === 'kh' ? 'នរណាក៏បានដែលមានតំណ' : 'Anyone with the link'}</option>
                              <option value="restricted">{lang === 'kh' ? 'កំណត់ចំពោះអ្នកអនុញ្ញាត' : 'Restricted'}</option>
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          </div>
                        </label>
                        <label className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600">
                          <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                            {lang === 'kh' ? 'តួនាទី' : 'Role'}
                          </span>
                          <div className="relative">
                            <select
                              value={shareRole}
                              onChange={(e) => setShareRole(e.target.value as 'viewer' | 'commenter' | 'editor')}
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                              <option value="viewer">{lang === 'kh' ? 'មើលប៉ុណ្ណោះ' : 'Viewer'}</option>
                              <option value="commenter">{lang === 'kh' ? 'មតិយោបល់' : 'Commenter'}</option>
                              <option value="editor">{lang === 'kh' ? 'កែសម្រួល' : 'Editor'}</option>
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          </div>
                        </label>
                      </div>
                   </div>
                </div>
              </motion.div>
            </div>
          )}

          {showHistoryModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden"
              >
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                   <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                        <History size={20} />
                      </div>
                      {t.versionHistory}
                   </h2>
                   <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                      <X size={20} />
                   </button>
                </div>
                <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                   <div className="space-y-4">
                      {loadingSnapshots ? (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          {lang === 'kh' ? 'កំពុងទាញយកប្រវត្តិកំណែ...' : 'Loading version history...'}
                        </div>
                      ) : lessonSnapshots.length === 0 ? (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          {lang === 'kh' ? 'មិនទាន់មាន snapshot ទេ' : 'No snapshots yet'}
                        </div>
                      ) : (
                        lessonSnapshots.map((v, i) => {
                          const isCurrent = i === 0;
                          const isRestoring = restoringSnapshotId === v.id;
                          return (
                            <div key={v.id} className={cn(
                              "p-4 rounded-2xl border transition-all flex justify-between items-center",
                              isCurrent ? "border-blue-200 bg-blue-50 shadow-sm" : "border-slate-100 hover:border-slate-200"
                            )}>
                              <div className="flex items-center gap-4">
                                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold", isCurrent ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400")}>
                                  {user?.displayName?.charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{new Date(v.createdAt).toLocaleString()}</p>
                                  <p className="text-xs text-slate-500">{v.triggerType === 'autosave' ? 'Autosave' : v.triggerType === 'restore' ? 'Restore' : 'Manual save'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isCurrent ? (
                                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Current</span>
                                ) : (
                                  <button
                                    onClick={() => restoreSnapshot(v.id)}
                                    disabled={!!restoringSnapshotId}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {isRestoring ? (lang === 'kh' ? 'កំពុងស្តារ...' : 'Restoring...') : (lang === 'kh' ? 'ស្តារឡើងវិញ' : 'Restore')}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                   </div>
                   <div className="mt-8 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 text-xs text-center font-medium">
                      {lang === 'kh' ? 'Autosave នីមួយៗត្រូវបានរក្សាទុកជា snapshot ក្នុង PostgreSQL' : 'Each autosave is stored as a snapshot in PostgreSQL'}
                   </div>
                </div>
              </motion.div>
            </div>
          )}

          {showExportModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col md:flex-row overflow-hidden relative"
              >
                {/* Left Side: Live Preview */}
                <div className="flex-1 bg-slate-100/50 p-8 overflow-y-auto border-r border-slate-100 custom-scrollbar">
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">{t.previewPdf}</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[11px] font-bold text-slate-600">{totalPages} {t.totalPages}</span>
                    </div>
                  </div>
                  
                  <div className="mx-auto shadow-2xl ring-1 ring-slate-200 bg-white transition-all duration-500 overflow-hidden" 
                    style={{ 
                      width: exportSettings.orientation === 'portrait' ? '100%' : '100%', 
                      maxWidth: `${exportSettings.orientation === 'portrait' ? getPageDimensions(exportSettings.pageSize).width : getPageDimensions(exportSettings.pageSize).height}px`,
                      aspectRatio: (() => {
                        const dims = getPageDimensions(exportSettings.pageSize);
                        return exportSettings.orientation === 'portrait'
                          ? `${dims.width}/${dims.height}`
                          : `${dims.height}/${dims.width}`;
                      })(),
                    }}>
                    <div 
                      className="h-full bg-white transition-all duration-300 overflow-y-auto custom-scrollbar" 
                      id="pdf-preview-container"
                      style={{ 
                        padding: `${exportSettings.margins}px`,
                        paddingLeft: `${exportSettings.margins + 2}px`,
                        paddingRight: `${exportSettings.margins + 2}px`
                      }}
                    >
                       <div className="doc-header border-b-2 border-blue-500 pb-5 mb-8">
                          <h1 className="text-3xl font-black text-slate-900 leading-tight mb-2">{activeLesson?.title}</h1>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {new Date().toLocaleDateString()} • {lang === 'kh' ? 'ឯកសារមេរៀន' : 'Lesson Document'}
                          </p>
                       </div>
                       <DocViewer content={activeLesson?.content || ''} fontSize={fontSize} />
                    </div>
                  </div>
                </div>

                {/* Right Side: Settings */}
                <div className="w-full md:w-[380px] flex flex-col bg-white">
                  <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                        <Download size={20} />
                      </div>
                      {t.exportSettings}
                    </h2>
                    <button 
                      onClick={() => setShowExportModal(false)}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {/* Page Size */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{t.pageSize}</label>
                      <div className="grid grid-cols-3 gap-2">
                        {exportPageOptions.map((size) => (
                          <button
                            key={size.key}
                            onClick={() => setExportSettings(s => ({ ...s, pageSize: size.key }))}
                            className={cn(
                              "py-2.5 px-3 rounded-xl border-2 transition-all text-[13px] font-bold",
                              exportSettings.pageSize === size.key
                                ? "border-blue-600 bg-blue-50 text-blue-700" 
                                : "border-slate-100 bg-slate-50/50 text-slate-500 hover:border-slate-200"
                            )}
                          >
                            {size.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Orientation */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{t.orientation}</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['portrait', 'landscape'] as const).map((orient) => (
                          <button
                            key={orient}
                            onClick={() => setExportSettings(s => ({ ...s, orientation: orient }))}
                            className={cn(
                              "py-2.5 px-3 rounded-xl border-2 flex items-center justify-center gap-2 transition-all text-[13px] font-bold",
                              exportSettings.orientation === orient 
                                ? "border-blue-600 bg-blue-50 text-blue-700" 
                                : "border-slate-100 bg-slate-50/50 text-slate-500 hover:border-slate-200"
                            )}
                          >
                            <Monitor size={16} className={orient === 'landscape' ? 'rotate-90 text-blue-500' : 'text-blue-500'} />
                            {t[orient]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Margins */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{t.margins}</label>
                        <span className="text-xs font-bold text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded-lg">{exportSettings.margins}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="8" 
                        max="48" 
                        step="2"
                        value={exportSettings.margins}
                        onChange={(e) => setExportSettings(s => ({ ...s, margins: parseInt(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>

                    {/* Page Range Selection */}
                    <div className="space-y-4 border-t border-slate-50 pt-8">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">{t.pageRange}</label>
                       <div className="flex gap-2 mb-4">
                          <button 
                            onClick={() => setExportSettings(s => ({ ...s, useCustomRange: false }))}
                            className={cn(
                              "flex-1 py-2 px-3 rounded-xl border-2 text-[12px] font-bold transition-all",
                              !exportSettings.useCustomRange ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-100 text-slate-400"
                            )}
                          >
                            {t.allPages}
                          </button>
                          <button 
                            onClick={() => setExportSettings(s => ({ ...s, useCustomRange: true }))}
                            className={cn(
                              "flex-1 py-2 px-3 rounded-xl border-2 text-[12px] font-bold transition-all",
                              exportSettings.useCustomRange ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-100 text-slate-400"
                            )}
                          >
                            {t.customRange}
                          </button>
                       </div>

                       {exportSettings.useCustomRange && (
                         <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex-1 space-y-2">
                               <span className="text-[10px] text-slate-400 font-bold uppercase">{t.startPage}</span>
                               <input 
                                 type="number" 
                                 min="1" 
                                 max={totalPages}
                                 value={exportSettings.startPage}
                                 onChange={(e) => setExportSettings(s => ({ ...s, startPage: parseInt(e.target.value) }))}
                                 className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-600 font-bold text-slate-700"
                               />
                            </div>
                            <div className="mt-6 font-bold text-slate-300">to</div>
                            <div className="flex-1 space-y-2">
                               <span className="text-[10px] text-slate-400 font-bold uppercase">{t.endPage}</span>
                               <input 
                                 type="number" 
                                 min={exportSettings.startPage} 
                                 max={totalPages}
                                 value={exportSettings.endPage}
                                 onChange={(e) => setExportSettings(s => ({ ...s, endPage: parseInt(e.target.value) }))}
                                 className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-600 font-bold text-slate-700"
                               />
                            </div>
                         </div>
                       )}
                    </div>
                  </div>

                  <div className="p-8 bg-slate-50 border-t border-slate-100">
                    <button
                      onClick={() => handleDownloadPDF(exportSettings)}
                      disabled={isExporting}
                      className="w-full py-4 px-6 rounded-[20px] bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-200 disabled:opacity-50 active:scale-[0.98]"
                    >
                      {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                      {t.download}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
