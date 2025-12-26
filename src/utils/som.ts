/**
 * Visual Anchor Manager (Set-of-Mark)
 * 负责在页面元素上注入和移除视觉锚点（编号标签）
 */
export class VisualAnchorManager {
    private static anchorClass = 'ai-visual-anchor';
    private static overlayId = 'ai-visual-anchor-overlay';

    /**
     * 注入视觉锚点
     * @returns 注入的锚点映射表 { id: element }
     */
    public static injectAnchors(): Map<number, HTMLElement> {
        this.removeAnchors(); // 清理旧锚点

        const interactiveTags = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG', 'svg'];
        const elements = Array.from(document.querySelectorAll('*')).filter(el => {
            // 过滤不可见元素
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

            // 过滤太小的元素
            const rect = el.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return false;

            // 包含关键交互标签
            if (interactiveTags.includes(el.tagName)) return true;

            // 包含点击事件监听器 (简单判断，不一定准确)
            // if (el.onclick || el.getAttribute('onclick')) return true;

            return false;
        });

        // 创建覆盖层容器
        const overlay = document.createElement('div');
        overlay.id = this.overlayId;
        Object.assign(overlay.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '2147483647', // Max z-index
            overflow: 'hidden'
        });
        document.body.appendChild(overlay);

        const anchorMap = new Map<number, HTMLElement>();
        let counter = 1;

        elements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

            // 创建高亮框
            const box = document.createElement('div');
            box.className = this.anchorClass;
            Object.assign(box.style, {
                position: 'absolute',
                top: `${rect.top + scrollTop}px`,
                left: `${rect.left + scrollLeft}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                border: '2px solid #ff0000',
                boxSizing: 'border-box',
                pointerEvents: 'none'
            });

            // 创建编号标签
            const label = document.createElement('span');
            label.textContent = `${counter}`;
            Object.assign(label.style, {
                position: 'absolute',
                top: '-2px',
                left: '-2px',
                backgroundColor: '#ff0000',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold',
                padding: '0 4px',
                lineHeight: '14px',
                zIndex: '1'
            });

            box.appendChild(label);
            overlay.appendChild(box);

            // 记录映射
            anchorMap.set(counter, el as HTMLElement);
            // 在元素上临时存储 ID，方便后续提取
            el.setAttribute('data-ai-anchor-id', `${counter}`);

            counter++;
        });

        return anchorMap;
    }

    /**
     * 移除所有视觉锚点
     */
    public static removeAnchors(): void {
        const overlay = document.getElementById(this.overlayId);
        if (overlay) {
            overlay.remove();
        }

        // 清理元素上的属性
        document.querySelectorAll('[data-ai-anchor-id]').forEach(el => {
            el.removeAttribute('data-ai-anchor-id');
        });
    }
}
