/**
 * Page Extractor V3
 * 生成 "Minified Pseudo-HTML" 以最大程度节省 Token
 */

interface ClonePagePackage {
    project_name: string;
    viewport: { width: number; height: number };
    screenshot: string; // Base64
    structure: string;  // Changed to string (Pseudo-HTML)
    global_tokens: {
        colors: string[];
        fonts: string[];
    };
}

class StyleAbbreviator {
    // 属性映射表
    private static propMap: Record<string, string> = {
        'background-color': 'bg',
        'background-image': 'bg-img',
        'color': 'c',
        'width': 'w',
        'height': 'h',
        'font-size': 'fz',
        'font-weight': 'fw',
        'font-family': 'ff',
        'line-height': 'lh',
        'text-align': 'ta',
        'border-radius': 'br',
        'border': 'bd',
        'box-shadow': 'sh',
        'opacity': 'op',
        'z-index': 'z',
        'position': 'pos',
        'top': 't',
        'left': 'l',
        'right': 'r',
        'bottom': 'b',
        'display': 'd',
        'flex-direction': 'fd',
        'justify-content': 'jc',
        'align-items': 'ai',
        'gap': 'g',
        'margin': 'm',
        'padding': 'p',
        'overflow': 'ov',
        'cursor': 'cur'
    };

    // 值映射表 (常用值缩写)
    private static valueMap: Record<string, string> = {
        'flex': 'flex',
        'grid': 'grid',
        'block': 'blk',
        'inline-block': 'ib',
        'absolute': 'abs',
        'relative': 'rel',
        'fixed': 'fix',
        'center': 'ctr',
        'space-between': 'sb',
        'space-around': 'sa',
        'space-evenly': 'se',
        'flex-start': 'start',
        'flex-end': 'end',
        'column': 'col',
        'row': 'row',
        'hidden': 'hide',
        'pointer': 'ptr'
    };

    public static abbreviate(styles: Record<string, string>): string {
        const parts: string[] = [];
        for (const [key, value] of Object.entries(styles)) {
            const shortKey = this.propMap[key] || key;
            const shortValue = this.valueMap[value] || value;
            parts.push(`${shortKey}:${shortValue}`);
        }
        return parts.join(';');
    }
}

export class PageExtractor {
    // 样式白名单
    private static styleWhitelist = [
        'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
        'position', 'top', 'left', 'right', 'bottom', 'z-index',
        'margin', 'padding',
        'width', 'height', 'overflow',
        'background-color', 'background-image',
        'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
        'border', 'border-radius', 'box-shadow', 'opacity',
        'cursor'
    ];

    // 标签白名单
    private static tagWhitelist = [
        'DIV', 'SECTION', 'HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'A', 'IMG', 'SVG',
        'BUTTON', 'INPUT', 'LABEL', 'FORM', 'TEXTAREA', 'SELECT',
        'UL', 'OL', 'LI', 'TABLE', 'TR', 'TD'
    ];

    public static generateContextPackage(screenshotBase64: string): ClonePagePackage {
        // const structure = this.getCleanDOMString(document.body);

        return {
            project_name: "Web_Clone_Task",
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            screenshot: screenshotBase64,
            structure: "", // structure || '',
            global_tokens: { colors: [], fonts: [] }
        };
    }

    private static getCleanDOMString(node: Node, depth: number = 0): string | null {
        const indent = '  '.repeat(depth);

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (!text) return null;
            // 文本内容直接返回，不带标签，或者用简单的 text 标记
            return `${indent}${text.length > 50 ? text.substring(0, 50) + '...' : text}`;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return null;

        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        // 1. 可见性检查
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || (style.width === '0px' && style.height === '0px' && style.overflow === 'hidden')) {
            return null;
        }

        // 2. 标签过滤
        if (!this.tagWhitelist.includes(el.tagName) && el.tagName !== 'BODY') {
            if (el.tagName !== 'DIV') return null;
        }

        // 3. 提取属性
        let attrsString = '';
        if (el.id) attrsString += ` id="${el.id}"`;

        const anchorId = el.getAttribute('data-ai-anchor-id');
        if (anchorId) attrsString += ` som="${anchorId}"`;

        if (el.tagName === 'IMG') attrsString += ` src="${(el as HTMLImageElement).src}"`;
        if (el.tagName === 'A') attrsString += ` href="${(el as HTMLAnchorElement).href}"`;
        if (el.tagName === 'INPUT') {
            attrsString += ` type="${(el as HTMLInputElement).type}"`;
            const ph = (el as HTMLInputElement).placeholder;
            if (ph) attrsString += ` ph="${ph}"`;
        }

        // 4. 提取样式并缩写
        const styles = this.getComputedStyles(el);
        const styleString = StyleAbbreviator.abbreviate(styles);
        if (styleString) {
            attrsString += ` s="${styleString}"`;
        }

        // 5. 递归子节点
        const childrenStrings: string[] = [];
        el.childNodes.forEach(child => {
            const childStr = this.getCleanDOMString(child, depth + 1);
            if (childStr) childrenStrings.push(childStr);
        });

        // 6. 过滤空节点
        const isReplaced = ['img', 'input', 'svg', 'button', 'br', 'hr'].includes(tagName);
        if (childrenStrings.length === 0 && !isReplaced && !styles['min-height'] && !styles['height'] && !styles['width'] && !styles['padding']) {
            // 如果没有内容且没有尺寸/内边距，忽略
            // 注意：这里判断比较宽泛，为了压缩
            // 修正：如果只是一个空的 div 但有背景色，应该保留
            if (!styles['background-color'] && !styles['border']) {
                return null;
            }
        }

        // 7. 智能 Flatten (去除冗余包装层)
        // 如果是 div，没有样式(s="")，没有属性(id/som)，且只有一个子元素
        if (tagName === 'div' && !styleString && !el.id && !anchorId && childrenStrings.length === 1) {
            // 如果子元素是文本，不能 flatten (因为 div 提供了块级上下文)
            // 除非父元素也是 flex/grid... 
            // 简单起见，只 flatten 元素节点。由于 getCleanDOMString 返回的是字符串，我们很难判断子节点类型。
            // 这里我们通过判断 childrenStrings[0] 是否以 '<' 开头来猜测
            if (childrenStrings[0].trim().startsWith('<')) {
                return childrenStrings[0]; // 直接返回子元素字符串
            }
        }

        // 组装 HTML 字符串
        if (childrenStrings.length > 0) {
            return `${indent}<${tagName}${attrsString}>\n${childrenStrings.join('\n')}\n${indent}</${tagName}>`;
        } else {
            return `${indent}<${tagName}${attrsString} />`;
        }
    }

    private static getComputedStyles(el: HTMLElement): Record<string, string> {
        const style = window.getComputedStyle(el);
        const result: Record<string, string> = {};

        this.styleWhitelist.forEach(prop => {
            let value = style.getPropertyValue(prop);

            // 过滤无效或默认值
            if (!value || value === 'none' || value === 'auto' || value === 'normal' || value === '0px' || value === 'rgba(0, 0, 0, 0)' || value === 'transparent' || value === '0' || value === 'static') {
                return;
            }

            // 简化数值
            if (value.endsWith('px')) {
                const num = parseFloat(value);
                if (!isNaN(num)) value = String(Math.round(num));
            }

            // 颜色转换
            if (value.startsWith('rgb')) {
                value = this.rgbToHex(value);
            }

            result[prop] = value;
        });

        return result;
    }

    private static rgbToHex(rgb: string): string {
        const match = rgb.match(/\d+/g);
        if (!match || match.length < 3) return rgb;
        const r = parseInt(match[0]);
        const g = parseInt(match[1]);
        const b = parseInt(match[2]);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
}
