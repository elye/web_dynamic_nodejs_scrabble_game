import * as fs from 'fs';
import * as path from 'path';

export class Validator {
  private dictionary: Set<string>;
  private trie: TrieNode | null = null;

  constructor() {
    this.dictionary = new Set();
    this.loadDictionary();
  }

  private loadDictionary(): void {
    // In dev, __dirname is server/game; in production, dist/server/game
    // Dictionary is always at project_root/server/dictionary/sowpods.txt
    let dictPath = path.join(__dirname, '..', 'dictionary', 'sowpods.txt');
    if (!fs.existsSync(dictPath)) {
      dictPath = path.join(__dirname, '..', '..', '..', 'server', 'dictionary', 'sowpods.txt');
    }
    try {
      const content = fs.readFileSync(dictPath, 'utf-8');
      const words = content.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
      for (const word of words) {
        this.dictionary.add(word);
      }
      console.log(`Dictionary loaded: ${this.dictionary.size} words`);
    } catch (err) {
      console.error('Failed to load dictionary:', err);
    }
  }

  isValidWord(word: string): boolean {
    return this.dictionary.has(word.toUpperCase());
  }

  validateWords(words: string[]): { valid: boolean; invalidWords: string[] } {
    const invalidWords: string[] = [];
    for (const word of words) {
      if (!this.isValidWord(word)) {
        invalidWords.push(word);
      }
    }
    return { valid: invalidWords.length === 0, invalidWords };
  }

  buildTrie(): TrieNode {
    if (this.trie) return this.trie;
    this.trie = new TrieNode();
    for (const word of this.dictionary) {
      this.trie.insert(word);
    }
    console.log('Trie built for AI move generation');
    return this.trie;
  }

  getDictionary(): Set<string> {
    return this.dictionary;
  }
}

export class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEnd: boolean = false;

  insert(word: string): void {
    let node: TrieNode = this;
    for (const ch of word) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new TrieNode());
      }
      node = node.children.get(ch)!;
    }
    node.isEnd = true;
  }

  hasPrefix(prefix: string): boolean {
    let node: TrieNode = this;
    for (const ch of prefix) {
      if (!node.children.has(ch)) return false;
      node = node.children.get(ch)!;
    }
    return true;
  }

  hasWord(word: string): boolean {
    let node: TrieNode = this;
    for (const ch of word) {
      if (!node.children.has(ch)) return false;
      node = node.children.get(ch)!;
    }
    return node.isEnd;
  }

  getNode(prefix: string): TrieNode | null {
    let node: TrieNode = this;
    for (const ch of prefix) {
      if (!node.children.has(ch)) return null;
      node = node.children.get(ch)!;
    }
    return node;
  }
}
