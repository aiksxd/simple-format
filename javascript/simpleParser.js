class SimpleParser {
    constructor() {
        this.indentType = null; // 'space' 或 'tab'
        this.indentSize = null;
        this.outerParsed = false;
    }

    /**
     * 解析 Simple 字符串为 JavaScript 对象
     */
    parse(simpleStr, options = {}) {
        const defaultOptions = {
            arrayFormat: 'indexed' // 'indexed' 或 'values'
        };
        options = { ...defaultOptions, ...options };

        // 处理注释和多行字符串
        const processed = this._removeComments(simpleStr);
        const lines = this._processMultilineStrings(processed);

        // 解析为 AST
        const ast = this._linesToAst(lines, options);

        // 转换为对象
        return this._astToObject(ast);
    }

    /**
     * 将 JavaScript 对象序列化为 Simple 字符串
     */
    stringify(obj, options = {}) {
        const defaultOptions = {
            indent: 2,
            indentChar: ' ',
            compact: false,
            arrayFormat: 'indexed' // 'indexed' 或 'values'
        };
        options = { ...defaultOptions, ...options };

        this.outerParsed = false;
        return this._objectToSimple(obj, 0, options);
    }

    // ============ 解析相关方法 ============

    _removeComments(str) {
        let result = '';
        let inMultiLineComment = false;
        let inString = false;
        let stringChar = null;
        let i = 0;

        while (i < str.length) {
            const char = str[i];
            const nextChar = str[i + 1];

            // 处理字符串
            if (!inMultiLineComment && (char === '"' || char === "'")) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                    result += char;
                } else if (stringChar === char && str[i - 1] !== '\\') {
                    inString = false;
                    stringChar = null;
                    result += char;
                } else {
                    result += char;
                }
                i++;
                continue;
            }

            // 处理转义字符（在字符串内）
            if (inString && char === '\\') {
                result += char + nextChar;
                i += 2;
                continue;
            }

            // 处理多行注释
            if (!inString && char === '/' && nextChar === '*') {
                inMultiLineComment = true;
                i += 2;
                continue;
            }

            if (inMultiLineComment && char === '*' && nextChar === '/') {
                inMultiLineComment = false;
                i += 2;
                continue;
            }

            if (inMultiLineComment) {
                i++;
                continue;
            }

            // 处理单行注释
            if (!inString && ((char === '/' && nextChar === '/') || char === '#')) {
                // 跳过直到行尾
                while (i < str.length && str[i] !== '\n') {
                    i++;
                }
                continue;
            }

            result += char;
            i++;
        }

        return result;
    }

    _processMultilineStrings(str) {
        const lines = [];
        let currentLine = '';
        let inString = false;
        let stringChar = null;
        let i = 0;

        while (i < str.length) {
            const char = str[i];

            // 处理字符串开始/结束
            if (char === '"' || char === "'") {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (stringChar === char && str[i - 1] !== '\\') {
                    inString = false;
                    stringChar = null;
                }
            }

            // 处理转义字符
            if (char === '\\' && inString) {
                const nextChar = str[i + 1];
                if (nextChar === 'n') {
                    currentLine += '\n';
                    i += 2;
                    continue;
                } else if (nextChar === 't') {
                    currentLine += '\t';
                    i += 2;
                    continue;
                }
            }

            if (char === '\n') {
                lines.push(currentLine);
                currentLine = '';
            } else {
                currentLine += char;
            }
            i++;
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.filter(line => line.trim().length > 0);
    }

    _linesToAst(lines, options) {
        const ast = { type: 'object', children: [] };
        const stack = [{ node: ast, indent: -1 }];

        // 检测缩进类型
        this._detectIndentType(lines);

        for (const line of lines) {
            const indent = this._getIndentLevel(line);
            const trimmed = line.trim();

            if (!trimmed) continue;

            // 跳过空行和纯注释行
            if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
                continue;
            }

            // 弹出栈直到找到合适的父级
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            const parent = stack[stack.length - 1];

            // 处理纯值数组（arrayFormat为'values'且父节点是数组）
            if (options.arrayFormat === 'values' && parent.node.type === 'array' && !line.includes(':')) {
                // 纯值数组格式，没有冒号和键
                const node = {
                    key: '-', // 使用-表示自动分配索引
                    value: this._parseValue(trimmed),
                    type: this._getValueType(trimmed),
                    indent
                };

                parent.node.children.push(node);
                continue;
            }

            // 解析键值对
            const [key, value] = this._parseKeyValue(trimmed, parent.node.type);

            const node = {
                key,
                value: value.value,
                type: value.type,
                indent
            };

            if (value.type === 'object' || value.type === 'array') {
                node.children = [];
                stack.push({ node, indent });
            }

            parent.node.children.push(node);
        }

        return ast;
    }

    _detectIndentType(lines) {
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
                continue;
            }

            const leading = line.match(/^(\s+)/);
            if (leading) {
                const spaces = leading[1];
                if (spaces.includes('\t')) {
                    this.indentType = 'tab';
                    this.indentSize = 1;
                } else {
                    this.indentType = 'space';
                    this.indentSize = spaces.length;
                }
                break;
            }
        }

        if (!this.indentType) {
            this.indentType = 'space';
            this.indentSize = 2;
        }
    }

    _getIndentLevel(line) {
        if (this.indentType === 'tab') {
            const tabs = line.match(/^(\t*)/)[1];
            return tabs.length;
        } else {
            const spaces = line.match(/^(\s*)/)[1];
            return Math.floor(spaces.length / this.indentSize);
        }
    }

    _parseKeyValue(line, parentType) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            throw new Error(`Invalid line: ${line}`);
        }

        const key = line.substring(0, colonIndex).trim();
        let valueStr = line.substring(colonIndex + 1).trim();

        // 解析值
        let value = { type: 'string', value: valueStr };

        if (valueStr === 'None') {
            value = { type: 'null', value: null };
        } else if (valueStr === '{}') {
            value = { type: 'object', value: {} };
        } else if (valueStr === '[]') {
            value = { type: 'array', value: [] };
        } else if (this._isNumber(valueStr)) {
            value = { type: 'number', value: this._parseNumber(valueStr) };
        } else if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
                (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
            value = {
                type: 'string',
                value: this._parseString(valueStr.substring(1, valueStr.length - 1))
            };
        } else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
            // 内联数组 - 立即解析
            const arrayValue = this._parseInlineArray(valueStr);
            value = { type: 'array', value: arrayValue };
        } else if (valueStr.startsWith('{') && valueStr.endsWith('}')) {
            // 内联对象 - 立即解析
            const objValue = this._parseInlineObject(valueStr);
            value = { type: 'object', value: objValue };
        } else {
            // 无引号字符串
            value = { type: 'string', value: this._parseString(valueStr) };
        }

        return [key, value];
    }

    _parseValue(valueStr) {
        if (valueStr === 'None') {
            return null;
        } else if (valueStr === '{}') {
            return {};
        } else if (valueStr === '[]') {
            return [];
        } else if (this._isNumber(valueStr)) {
            return this._parseNumber(valueStr);
        } else if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
                  (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
            return this._parseString(valueStr.substring(1, valueStr.length - 1));
        } else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
            return this._parseInlineArray(valueStr);
        } else if (valueStr.startsWith('{') && valueStr.endsWith('}')) {
            return this._parseInlineObject(valueStr);
        } else {
            return this._parseString(valueStr);
        }
    }

    _getValueType(valueStr) {
        if (valueStr === 'None') {
            return 'null';
        } else if (valueStr === '{}') {
            return 'object';
        } else if (valueStr === '[]') {
            return 'array';
        } else if (this._isNumber(valueStr)) {
            return 'number';
        } else if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
                  (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
            return 'string';
        } else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
            return 'array';
        } else if (valueStr.startsWith('{') && valueStr.endsWith('}')) {
            return 'object';
        } else {
            return 'string';
        }
    }

    _isNumber(str) {
        return /^-?\d+(\.\d+)?$/.test(str);
    }

    _parseNumber(str) {
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    _parseString(str) {
        // 处理转义字符
        return str.replace(/\\([nrt\\"])/g, (match, escaped) => {
            switch (escaped) {
                case 'n': return '\n';
                case 'r': return '\r';
                case 't': return '\t';
                case '\\': return '\\';
                case '"': return '"';
                default: return escaped;
            }
        });
    }

    _parseInlineArray(str) {
        const content = str.substring(1, str.length - 1).trim();
        if (!content) return [];

        const items = this._splitByComma(content);
        return items.map(item => {
            const trimmed = item.trim();
            return this._parseValue(trimmed);
        });
    }

    _parseInlineObject(str) {
        const content = str.substring(1, str.length - 1).trim();
        if (!content) return {};

        const obj = {};
        const pairs = this._splitByComma(content);

        for (const pair of pairs) {
            const colonIndex = pair.indexOf(':');
            if (colonIndex === -1) continue;

            const key = pair.substring(0, colonIndex).trim();
            const valueStr = pair.substring(colonIndex + 1).trim();

            obj[key] = this._parseValue(valueStr);
        }

        return obj;
    }

    _splitByComma(str) {
        const result = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = null;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if ((char === '"' || char === "'") && (i === 0 || str[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (stringChar === char) {
                    inString = false;
                    stringChar = null;
                }
            }

            if (!inString) {
                if (char === '[' || char === '{') depth++;
                if (char === ']' || char === '}') depth--;

                if (char === ',' && depth === 0) {
                    result.push(current.trim());
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        if (current.trim()) {
            result.push(current.trim());
        }

        return result;
    }

    _astToObject(astNode) {
        // 处理基础类型的节点（不是对象或数组）
        if (!astNode.type || astNode.type === 'string' || astNode.type === 'number' || astNode.type === 'null') {
            return astNode.value;
        }

        if (astNode.type === 'object') {
            const obj = {};
            for (const child of astNode.children || []) {
                if (child.type === 'object' || child.type === 'array') {
                    obj[child.key] = this._astToObject(child);
                } else {
                    // 对于基础类型，直接使用value
                    obj[child.key] = child.value;
                }
            }
            return obj;
        } else if (astNode.type === 'array') {
            // 处理内联数组（没有children的情况）
            if (astNode.value && !astNode.children) {
                return astNode.value;
            }

            // 处理通过缩进定义的多行数组
            const array = [];
            const explicitIndices = [];
            const dashIndices = [];

            for (const child of (astNode.children || [])) {
                if (child.key === '-') {
                    dashIndices.push({
                        value: this._astToObject(child),
                        child
                    });
                } else if (child.key.includes('-')) {
                    // 处理区间
                    const [start, end] = child.key.split('-').map(Number);
                    const value = this._astToObject(child);

                    for (let i = start; i <= end; i++) {
                        array[i] = value;
                        explicitIndices.push(i);
                    }
                } else {
                    const index = parseInt(child.key, 10);
                    if (!isNaN(index)) {
                        array[index] = this._astToObject(child);
                        explicitIndices.push(index);
                    }
                }
            }

            // 处理补足符号 (-)
            let currentIndex = 0;
            for (const dash of dashIndices) {
                while (explicitIndices.includes(currentIndex)) {
                    currentIndex++;
                }
                array[currentIndex] = dash.value;
                currentIndex++;
            }

            // 移除空洞（undefined），用0填充
            for (let i = 0; i < array.length; i++) {
                if (array[i] === undefined) {
                    array[i] = 0;
                }
            }

            // 如果数组是空的，但value有内联数组数据
            if (array.length === 0 && astNode.value && Array.isArray(astNode.value)) {
                return astNode.value;
            }

            return array;
        } else {
            // 其他类型直接返回值
            return astNode.value;
        }
    }

    // ============ 序列化相关方法 ============

    _objectToSimple(obj, level, options) {
        if (obj === null) return 'None';
        if (typeof obj === 'number') return obj.toString();
        if (typeof obj === 'boolean') return obj.toString();
        if (typeof obj === 'string') {
            // 判断是否需要引号
            if (this._needsQuotes(obj)) {
                return `"${this._escapeString(obj)}"`;
            }
            return this._escapeString(obj);
        }

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';

            // 检查是否应该内联
            if (this._shouldInlineArray(obj)) {
                const items = obj.map(item => this._objectToSimple(item, level, options));
                return `[${items.join(', ')}]`;
            }

            // 多行数组
            let result = '[]\n';

            if (options.arrayFormat === 'values') {
                // 纯值数组格式
                for (let i = 0; i < obj.length; i++) {
                    const indent = this._getIndentString(level + 1, options);
                    const valueStr = this._objectToSimple(obj[i], level + 1, options);
                    result += `${indent}${valueStr}\n`;
                }
            } else {
                // 索引格式，支持区间表示
                let i = 0;
                while (i < obj.length) {
                    // 查找连续相同值的区间
                    let j = i + 1;
                    while (j < obj.length && this._isEqual(obj[i], obj[j])) {
                        j++;
                    }

                    const indent = this._getIndentString(level + 1, options);
                    const valueStr = this._objectToSimple(obj[i], level + 1, options);

                    if (j - i > 1) {
                        // 连续相同值，使用区间表示
                        result += `${indent}${i}-${j - 1}: ${valueStr}\n`;
                    } else {
                        result += `${indent}${i}: ${valueStr}\n`;
                    }

                    i = j;
                }
            }
            return result.trim();
        }

        if (typeof obj === 'object') {
            const entries = Object.entries(obj);

            // 检查是否应该内联
            if (this._shouldInlineObject(obj)) {
                const pairs = entries.map(([key, value]) =>
                    `${key}: ${this._objectToSimple(value, level, options)}`
                );
                return `{${pairs.join(', ')}}`;
            }

            let result = '';
            if (this.outerParsed) {
                result = '{}\n';
            } else {
                this.outerParsed = true;
            }

            for (const [key, value] of entries) {
                const indent = this._getIndentString(level, options);
                const valueStr = this._objectToSimple(value, level + 1, options);
                result += `${indent}${key}: ${valueStr}\n`;
            }
            return result.trim();
        }

        return '';
    }

    _isEqual(a, b) {
        if (typeof a !== typeof b) return false;

        if (a === null || b === null) {
            return a === b;
        }

        if (typeof a === 'object') {
            if (Array.isArray(a) && Array.isArray(b)) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (!this._isEqual(a[i], b[i])) return false;
                }
                return true;
            } else if (!Array.isArray(a) && !Array.isArray(b)) {
                const keysA = Object.keys(a);
                const keysB = Object.keys(b);
                if (keysA.length !== keysB.length) return false;
                for (const key of keysA) {
                    if (!this._isEqual(a[key], b[key])) return false;
                }
                return true;
            }
            return false;
        }

        return a === b;
    }

    _needsQuotes(str) {
        // 如果包含特殊字符、数字开头、或者可能是其他类型的关键字，需要引号
        if (/^\d/.test(str)) return true;
        if (str === 'None' || str === 'true' || str === 'false') return true;
        if (str.includes(':') || str.includes(',') || str.includes('[') ||
            str.includes(']') || str.includes('{') || str.includes('}')) return true;
        if (/^\s|\s$/.test(str)) return true;
        return false;
    }

    _escapeString(str) {
        return str.replace(/[\n\t\\"]/g, match => {
            switch (match) {
                case '\n': return '\\n';
                case '\t': return '\\t';
                case '\\': return '\\\\';
                case '"': return '\\"';
                default: return match;
            }
        });
    }

    _shouldInlineArray(arr) {
        if (arr.length === 0) return true;
        if (arr.length > 3) return false;

        // 检查元素复杂度
        for (const item of arr) {
            if (typeof item === 'object' && item !== null) return false;
            if (Array.isArray(item) && item.length > 0) return false;
        }

        return true;
    }

    _shouldInlineObject(obj) {
        const entries = Object.entries(obj);
        if (entries.length === 0) return true;
        if (entries.length > 3) return false;

        // 检查值复杂度
        for (const [_, value] of entries) {
            if (typeof value === 'object' && value !== null) return false;
            if (Array.isArray(value) && value.length > 0) return false;
        }

        return true;
    }

    _getIndentString(level, options) {
        const char = options.indentChar;
        const count = options.indent;
        return char.repeat(level * count);
    }
}

// ============ 使用示例 ============

const parser = new SimpleParser();

// 测试解析
const simpleStr = `name: sam
id: 21
id_string: '21'
teacher: {}
    student_ids: [20, 21, 22, 31]
/* 这样也可以，数列的子元素与\\t表示缩进
\\tstudent_ids: []
\\t\\t0: 20\\n\\t\\t1: 21  \\\\ 可以直接\\n表示换行，相当于json末尾的逗号
\\t\\t2: 22
\\t\\t3: 31
*/
// 通过缩进添加到数列时可以区间写数列
test: []
    1-3: 0
    5-6: 1
    -: 0 // - 来补足没有声明的0, 4`;

console.log('解析结果:');
const result = parser.parse(simpleStr);
console.log(JSON.stringify(result, null, 2));

// 测试序列化（使用区间表示）
console.log('\n序列化结果 (使用区间表示):');
const simpleOutput = parser.stringify(result, { indent: 2, arrayFormat: 'indexed' });
console.log(simpleOutput);

// 测试纯值数组格式解析
const simpleValuesArray = `fruits: []
    "apple"
    "banana"
    "cherry"
numbers: []
    1
    2
    3`;

console.log('\n解析纯值数组格式:');
const valuesResult = parser.parse(simpleValuesArray, { arrayFormat: 'values' });
console.log(JSON.stringify(valuesResult, null, 2));

// 测试序列化为纯值数组格式
console.log('\n序列化为纯值数组格式:');
const valuesOutput = parser.stringify(valuesResult, { indent: 2, arrayFormat: 'values' });
console.log(valuesOutput);

// 测试连续重复值的区间表示
const arrayWithRepeats = {
    name: "test",
    data: [1, 1, 1, 2, 3, 3, 4, 4, 4, 4, 5]
};

console.log('\n测试连续重复值区间表示:');
const repeatOutput = parser.stringify(arrayWithRepeats, { indent: 2, arrayFormat: 'indexed' });
console.log(repeatOutput);

// 测试循环解析和序列化
console.log('\n循环测试 (解析 -> 序列化 -> 再解析):');
const reParsed = parser.parse(simpleOutput);
console.log(JSON.stringify(reParsed, null, 2));
