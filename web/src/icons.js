import icon0 from 'lucide-static/icons/heading-1.svg?raw';
import icon1 from 'lucide-static/icons/heading-2.svg?raw';
import icon2 from 'lucide-static/icons/heading-3.svg?raw';
import icon3 from 'lucide-static/icons/bold.svg?raw';
import icon4 from 'lucide-static/icons/italic.svg?raw';
import icon5 from 'lucide-static/icons/strikethrough.svg?raw';
import icon6 from 'lucide-static/icons/code.svg?raw';
import icon8 from 'lucide-static/icons/link.svg?raw';
import icon9 from 'lucide-static/icons/image.svg?raw';
import icon10 from 'lucide-static/icons/quote.svg?raw';
import icon11 from 'lucide-static/icons/list.svg?raw';
import icon12 from 'lucide-static/icons/list-ordered.svg?raw';
import icon13 from 'lucide-static/icons/list-todo.svg?raw';
import icon14 from 'lucide-static/icons/square-code.svg?raw';
import icon16 from 'lucide-static/icons/table.svg?raw';
import icon17 from 'lucide-static/icons/minus.svg?raw';
import icon18 from 'lucide-static/icons/folder-open.svg?raw';
import icon19 from 'lucide-static/icons/save.svg?raw';
import icon20 from 'lucide-static/icons/undo-2.svg?raw';
import icon21 from 'lucide-static/icons/redo-2.svg?raw';
import icon22 from 'lucide-static/icons/eye.svg?raw';
import icon23 from 'lucide-static/icons/columns-2.svg?raw';
import icon24 from 'lucide-static/icons/rows-2.svg?raw';
import icon25 from 'lucide-static/icons/pencil.svg?raw';
import icon26 from 'lucide-static/icons/sun.svg?raw';
import icon27 from 'lucide-static/icons/moon.svg?raw';

const icons = {'heading-1':icon0, 'heading-2':icon1, 'heading-3':icon2, 'bold':icon3, 'italic':icon4, 'strikethrough':icon5, 'code':icon6, 'link':icon8, 'image':icon9, 'quote':icon10, 'list':icon11, 'list-ordered':icon12, 'list-todo':icon13, 'square-code':icon14, 'table':icon16, 'minus':icon17, 'folder-open':icon18, 'save':icon19, 'undo-2':icon20, 'redo-2':icon21, 'eye':icon22, 'columns-2':icon23, 'rows-2':icon24, 'pencil':icon25, 'sun':icon26, 'moon':icon27};

export function renderIcons() {
  for (const element of document.querySelectorAll('[data-icon]')) {
    const svg = icons[element.dataset.icon];
    if (svg) {
      element.innerHTML = svg;
      element.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    }
  }
}
