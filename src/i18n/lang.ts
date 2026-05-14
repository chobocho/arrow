export type LangCode = 'ko' | 'en';

type Dict = Record<string, string>;

const strings: Record<LangCode, Dict> = {
  ko: {
    appTitle: '화살표 마인드맵',
    modeSelect: '선택',
    modeArrow: '화살표',
    modeText: '글자',
    modePan: '이동',
    save: '저장',
    saveAs: '새이름저장',
    newWork: '새 작업',
    delete: '삭제',
    rename: '이름변경',
    exportPng: 'PNG 내보내기',
    exportJson: 'JSON 내보내기',
    importJson: 'JSON 가져오기',
    language: 'EN',
    works: '작업 목록',
    centerHint: '가운데 주제',
    editCenter: '주제 편집',
    promptCenter: '가운데 주제를 입력하세요',
    promptName: '작업 이름',
    promptRename: '새 이름',
    promptText: '글자를 입력하세요',
    confirmDelete: '정말 삭제할까요?',
    confirmDeleteSelected: '선택한 객체를 삭제할까요?',
    zoomIn: '확대',
    zoomOut: '축소',
    fit: '맞춤',
    selectColor: '색상',
    thickness: '굵기',
    fontSize: '글자 크기',
    saved: '저장됨',
    importedCount: '개 가져왔습니다',
    invalidJson: '잘못된 JSON 형식입니다',
    untitled: '제목 없음',
  },
  en: {
    appTitle: 'Arrow Mind Map',
    modeSelect: 'Select',
    modeArrow: 'Arrow',
    modeText: 'Text',
    modePan: 'Pan',
    save: 'Save',
    saveAs: 'Save As',
    newWork: 'New',
    delete: 'Delete',
    rename: 'Rename',
    exportPng: 'Export PNG',
    exportJson: 'Export JSON',
    importJson: 'Import JSON',
    language: '한',
    works: 'Works',
    centerHint: 'Center Topic',
    editCenter: 'Edit Topic',
    promptCenter: 'Enter the center topic',
    promptName: 'Work name',
    promptRename: 'New name',
    promptText: 'Enter text',
    confirmDelete: 'Delete this work?',
    confirmDeleteSelected: 'Delete the selected object?',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fit: 'Fit',
    selectColor: 'Color',
    thickness: 'Thickness',
    fontSize: 'Font Size',
    saved: 'Saved',
    importedCount: ' imported',
    invalidJson: 'Invalid JSON',
    untitled: 'Untitled',
  },
};

let currentLang: LangCode = 'ko';

export function setLang(code: LangCode): void {
  currentLang = code;
}

export function getLang(): LangCode {
  return currentLang;
}

export function t(key: string): string {
  return strings[currentLang][key] ?? strings.en[key] ?? key;
}
