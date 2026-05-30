document.addEventListener('DOMContentLoaded', _evDCL => {

  // ========== ========== ログ ========== ==========

  function openLog(): void {
    logText.textContent = Log.get().join('\n');
    logDialog.showModal();
  }

  // ========== ========== PWA ========== ==========

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
    .then((registration) => {
      Log.write(`[Main] ServiceWorker registration finished. Scope:${registration.scope}`);
    })
    .catch((reason) => {
      Log.write(`[Main] ServiceWorker registratio failed. Reason:${reason}`);
    });
  }

  if (navigator.language != null && navigator.language.length > 0) {
    document.documentElement.lang = navigator.language;
  }

  // ========== ========== タイマー ========== ==========

  const timer = new TickingTimer();

  /** １回の練習時間 [秒] */
  const T_EXERCISE = 180;

  // ========== ========== 定数・変数 ========== ==========

  type AppOpState = 'opening' | 'exercising' | 'finishing' | 'finished';

  type AppState = {
    state: AppOpState,
    letters: number,
    phrases: number,
    typos: number,
  };

  const current: AppState = {
    state: 'opening',
    letters: 0,
    phrases: 0,
    typos: 0,
  };

  const openingDialog = document.getElementById('opening') as HTMLDialogElement;

  const instructionArea = document.getElementById('instruction') as HTMLDivElement;

  /** 問題文表示領域 */
  const phraseDisplay = document.getElementById('phrase') as HTMLDivElement;

  const typeForm = document.getElementById('type-form') as HTMLFormElement;

  const typeArea = document.getElementById('type-input') as HTMLInputElement;

  const remainingTime = document.getElementById('remaining-time') as HTMLSpanElement;

  const numberOfLetters = document.getElementById('letters') as HTMLSpanElement;

  const maxLetters = document.getElementById('max-letters') as HTMLSpanElement;

  const numberOfPhrases = document.getElementById('num-phrases') as HTMLSpanElement;

  const numberOfTypos = document.getElementById('typos') as HTMLSpanElement;

  const lastScore = document.getElementById('last-score') as HTMLDivElement;

  const lastLetters = document.getElementById('last-letters') as HTMLSpanElement;

  const lastMaxLetters = document.getElementById('last-max-letters') as HTMLSpanElement;

  const lastPhrases = document.getElementById('last-phrases') as HTMLSpanElement;

  const lastTypos = document.getElementById('last-typos') as HTMLSpanElement;

  // const lastTyposContainer = document.getElementById('last-typos-container') as HTMLSpanElement;

  const conguraturations = document.getElementById('conguraturations') as HTMLDivElement;

  const exercisePeriod = document.getElementById('exercise-period') as HTMLSpanElement;
  exercisePeriod.textContent = (T_EXERCISE / 60).toString();

  const eraseButton = document.getElementById('erase-records') as HTMLButtonElement;

  const showShortcutButton = document.getElementById('show-shortcuts') as HTMLButtonElement;

  const shortcutDialog = document.getElementById('shortcut-dialog') as HTMLDialogElement;

  const shortcutDialogCloseButton = document.getElementById('shortcut-dialog-close-button') as HTMLButtonElement;

  const logOpenButton = document.getElementById('log-open') as HTMLButtonElement;

  const logCloseButton = document.getElementById('log-close') as HTMLButtonElement;

  const logDialog = document.getElementById('log-dialog') as HTMLDialogElement;

  const logText = document.getElementById('log-text') as HTMLDivElement;

  const CLASS_HIDE = 'hide';

  const CLASS_UNAVAILABLE = 'unavailable';

  // ========== ========== 本件特有の関数いろいろ ========== ==========

  function updateState(newState: AppOpState): void {
    current.state = newState;
    switch(newState) {
      case "opening":
        updateLastResult();
        openingDialog.showModal();
        showShortcutButton.blur();
        eraseButton.blur();
        break;
      case "exercising":
        current.letters = 0;
        current.phrases = 0;
        current.typos = 0;
        openingDialog.close();
        updateStatusArea(0);
        typeArea.disabled = false;
        typeArea.focus();
        break;
      case "finishing":
        typeArea.blur();
        typeArea.focus();
        typeArea.disabled = true;
        instructionArea.classList.add(CLASS_UNAVAILABLE);
        updateLastResult();
        updateStatusArea();
        openingDialog.showModal();
        showShortcutButton.blur();
        eraseButton.blur();
        lastScore.animate(
          [
            { backgroundColor: '#000000' },
            { backgroundColor: '#ffff00', offset: 0.2 },
            { backgroundColor: '#ffffff' },
          ],
          {
            duration: 2000,
          }
        );
        break;
      case "finished":
        instructionArea.classList.remove(CLASS_UNAVAILABLE);
        break;
    }
  }

  function updateStatusArea(second?: number): void {
    const highscore = AppConfig.getHighScore();
    numberOfLetters.textContent = current.letters.toString();
    maxLetters.textContent = highscore.letters.toString();
    numberOfPhrases.textContent = current.phrases.toString();
    numberOfTypos.textContent = current.typos.toString();
    if (second != null) {
      remainingTime.textContent = (T_EXERCISE - second).toString();
    }
  }

  function updateLastResult(): void {
    if (current.state === 'opening' || current.state === 'exercising') {
      lastScore.style.display = 'none';
    } else {
      lastScore.style.display = 'block';
      const highscore = AppConfig.getHighScore();
      lastLetters.textContent = current.letters.toString();
      lastMaxLetters.textContent = highscore.letters.toString();
      lastPhrases.textContent = current.phrases.toString();
      lastTypos.textContent = current.typos.toString();
    }
  }

  function setEventHandlers(): void {
    document.addEventListener('keyup', ev => {
      if (
        ev.keyCode === 13 
        && current.state !== 'exercising' 
        && current.state !== 'finishing'
      ) {
        Sound.obj().prepareSounds('start');
        PhraseManager.obj().init();
        updateState('exercising');
        setNewPhrase();
        timer.start();
      }
    });

    timer.setOnTick((second) => {
      updateStatusArea(second);
      if (second >= T_EXERCISE) {
        timer.stop();
        // 最後の入力中文字列を比較し、正しい数をカウントする
        {
          const phraseGraphemes = Util.divideGraphemes(currentPhrase);
          const inputGraphemes = Util.divideGraphemes(typeArea.value);
          let iDifferent = -1;
          for (let i=0 ; i<phraseGraphemes.length ; i++) {
            if (i >= inputGraphemes.length) {
              iDifferent = i;
              break;
            }
            if (phraseGraphemes[i] !== inputGraphemes[i]) {
              iDifferent = i;
              break;
            }
          }
          const nPass = (iDifferent < 0) ? phraseGraphemes.length : iDifferent;
          addLetters(nPass);
          updateStatusArea();
        }
        // 練習完了状態に遷移
        const ixRank = AppConfig.obj().addNewScore(
          current.letters,
          current.phrases,
          current.typos,
          timer.getStartTime(),
        );
        updateState('finishing');
        const onFinish = () => {
          updateState('finished');
        };
        if (ixRank === 1 && current.letters > 0) {
          Sound.obj().playSound('newRecord', onFinish);
          conguraturations.classList.remove(CLASS_HIDE);
        } else {
          Sound.obj().playSound('finish', onFinish);
          conguraturations.classList.add(CLASS_HIDE);
        }
      }
    });

    // IME確定状態でenterキーを打ったことを確実に検出するため、formのsubmitイベントを使う
    typeForm.addEventListener('submit', ev => {
      // submit処理そのものはキャンセル
      ev.preventDefault();

      // 入力文字列判定
      const ixFail = reflectPassOrFailOnPhrase();
      if (ixFail < 0) {
        addLetters(currentPhrase.length);
        current.phrases++;
        updateStatusArea();
        setNewPhrase();
        Sound.obj().playSound('pass');
      } else {
        current.typos++;
        updateStatusArea();
        Sound.obj().playSound('fail');
      }
    });

    showShortcutButton.addEventListener('click', _ => {
      shortcutDialog.showModal();
    });

    shortcutDialogCloseButton.addEventListener('click', _ => {
      shortcutDialog.close();
    });

    shortcutDialog.addEventListener('cancel', _ => {
      showShortcutButton.blur();
      eraseButton.blur();
    });
    shortcutDialog.addEventListener('close', _ => {
      showShortcutButton.blur();
      eraseButton.blur();
    });

    eraseButton.addEventListener('click', _ => {
      showShortcutButton.blur();
      eraseButton.blur();
      AppConfig.obj().clearRecords();
      updateLastResult();
      updateStatusArea();
    });

    logOpenButton.addEventListener('click', _ => {
      openLog();
    });

    logCloseButton.addEventListener('click', _ => {
      logDialog.close();
    });
  }

  function addLetters(n: number): void {
    current.letters += n;
  }

  const CLASS_TYPO = 'typo';

  function reflectPassOrFailOnPhrase(): number {
    const inputGraphemes = Util.divideGraphemes(typeArea.value);
    const phraseElements = Array.from(phraseDisplay.children);

    // フレーズの全ての子要素からtypoクラスの指定を解除する
    for (const el of phraseElements) {
      el.classList.remove(CLASS_TYPO);
    }

    let ixFail = -1;

    // 間違いが検出されたら、そこでtypoクラスを指定
    for (let i=0 ; i<phraseElements.length ; i++) {
      // 入力文字列を超えた場合
      if (i >= inputGraphemes.length) {
        // フレーズの子要素が続くようなら、そこ以降が未入力
        if (i < (phraseElements.length - 1)) {
          phraseElements[i]?.classList.add(CLASS_TYPO);
          ixFail = i;
        }
        // 判定打ち切り
        break;
      }

      // フレーズの最後の子要素はダミーの空白であり、ここで比較ができてしまう時点で入力が長すぎ
      if (i === (phraseElements.length - 1)) {
        phraseElements[i]?.classList.add(CLASS_TYPO);
        ixFail = i;
        // ここで判定は打ち切り
        break;
      }

      // 入力もフレーズもあるので比較
      if (inputGraphemes[i] !== phraseElements[i]?.textContent) {
        phraseElements[i]?.classList.add(CLASS_TYPO);
        ixFail = i;
        // ここで判定は打ち切り
        break;
      }
    }

    return ixFail;
  }

  /** 表記例の領域の中身を全て消す */
  function clearAnswer(): void {
    for (let ix = phraseDisplay.children.length-1; ix >= 0; ix--) {
      phraseDisplay.children.item(ix)?.remove();
    }
  }

  /** 表記例の領域に、span要素の配列を設定する（それまでの内容は消える） */
  function setSpansToAnswer(elements: HTMLElement[]): void {
    clearAnswer();
    for (const element of elements) {
      phraseDisplay.append(element);
    }
  }

  // ========== ========== 打鍵フレーズ管理 ========== ==========

  let currentPhrase:string = '';

  function setNewPhrase(): void {
    const result = PhraseManager.obj().getNextQuestionObject();
    currentPhrase = result.text;
    setSpansToAnswer(result.elements);
    typeArea.value = '';
    typeArea.focus();
  }

  // ========== ========== 初期処理 ========== ==========

  // 音声一覧取得以外のイベントハンドラを設定
  setEventHandlers();

  updateStatusArea(0);

  updateLastResult();

  updateState('opening');

});


/**
 * ――――――――――――――――――――――――――――――
 * 汎用的な処理を集めた名前空間
 * ――――――――――――――――――――――――――――――
 */
namespace Util {

  export function isNumber(value: any): value is number {
    return (value != null && typeof value === 'number');
  }

  export function isString(value: any): value is string {
    return (value != null && typeof value === 'string');
  }

  /**
   * 配列をシャッフルしたものを返す
   * @param array シャッフルする対象となる配列
   * @return シャッフルされた配列
   */
  export function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    const len = result.length
    for (let i = len-1 ; i > 0 ; i--) {
      const j = Math.floor(Math.random()*(i + 1));
      // @ts-expect-error
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * 等差数列の配列を作成する
   * @param start 開始値
   * @param count 数列の長さ
   * @param delta [option] 増分
   * @returns 数列の配列
   */
  export function generateArithmeticSequence(start: number, count: number, delta: number = 1): number[] {
    return [...Array(count)].map((_,ix) => ix*delta + start);
  }

  /** 日本語文字列を書記素単位に分割するためのオブジェクト */
  const SEGMENTER = new Intl.Segmenter(
    "ja-JP", 
    { granularity: "grapheme" }
  );

  /**
   * 文字列を書記素（人が認識する「１文字」）ごとの文字列に分割する。
   * 基本的には文字列をindexごとに分解した場合（コードポイントごとに分割した場合）と同様だが、
   * JIS第3水準の漢字や絵文字など複数のコードポイントで１つの書記素が形成される場合でも
   * 本関数なら「見た目の文字」ごとに分割できる。
   * @param text 元となる文字列
   * @returns 書記素ごとに分割された文字列の配列
   */
  export function divideGraphemes(text: string): string[] {
    return Array.from(SEGMENTER.segment(text)).map(s => s.segment);
  }
}

/**
 * ――――――――――――――――――――――――――――――
 * ログ出力
 * ――――――――――――――――――――――――――――――
 */
class Log {
  // singleton
  public static obj(): Log {
    if (this._obj == null) {
      this._obj = new Log();
    }
    return this._obj;
  }
  private static _obj: Log | undefined;
  // (end of singleton)

  public static get = () => this.obj().getLogs();

  public static write = (text: string) => this.obj().logWrite(text);

  readonly logArray: string[] = [];

  public getLogs(): string[] {
    return [...this.logArray];
  }

  public logWrite(text: string): void {
    this.logArray.push(text);
    console.log(text);
  }
}


/**
 * ――――――――――――――――――――――――――――――
 * １秒ごとに処理を呼び出すタイマー。
 * 毎秒ごとにドリフト誤差を自動的に補正するため概ねブラウザ環境の時刻精度で動作する。
 * ――――――――――――――――――――――――――――――
 */
class TickingTimer {
  private _timerId = 0;
  public isTimerWorking = () => this._timerId > 0;

  private _startTime = 0;
  public getStartTime = () => this._startTime;

  private _secondNow = 0;
  public getCurrentSeconds = () => this._secondNow;

  private _onTick: (second:number) => void = _ => {};

  /**
   * タイマーを開始する。
   * タイマーの自動終了はないので、tick関数からstop()を明示的に呼び出すこと。
   * もし既にタイマーが動いていた場合、既存のタイマーは破棄される。
   */
  public start(): void {
    if (this._timerId > 0) {
      this.stopTimer();
    }

    this._startTime = Date.now();
    this._secondNow = 0;

    this._timerId = setTimeout(() => {
      this.onTick();
    }, 1000);
  }

  /** タイマーを終了する */
  public stop(): void {
    this.stopTimer();
  }

  /** １秒ごとの処理を登録する */
  public setOnTick(func: (second: number) => void): void {
    this._onTick = (second) => func(second);
  }

  private stopTimer(): void {
    if (this._timerId > 0) {
      clearTimeout(this._timerId);
      this._timerId = 0;
    }
  }

  private onTick(): void {
    if (this._timerId > 0) {
      this._secondNow++;
      this._onTick(this._secondNow);
      if (this._timerId > 0) {
        const next = this._startTime + (this._secondNow + 1) * 1000;
        this._timerId = setTimeout(() => {
          this.onTick();
        }, next - Date.now());
      }
    }
  }
}


/**
 * ――――――――――――――――――――――――――――――
 * サウンド出力
 * ――――――――――――――――――――――――――――――
 */
class Sound {
  // singleton
  public static obj(): Sound {
    if (this._obj == null) {
      this._obj = new Sound();
    }
    return this._obj;
  }
  private static _obj: Sound | undefined;
  // (end of singleton)

  readonly _SOUNDS: Record<SoundType, SoundData> = {
    /** 練習開始サウンド */
    start: {
      audio: new Audio('./sounds/start.mp3'),
      volume: 10,
      isLoop: false,
    },
    /** 練習終了サウンド */
    finish: {
      audio: new Audio('./sounds/finish.mp3'),
      volume: 10,
      isLoop: false,
    },
    /** ハイスコア時サウンド */
    newRecord: {
      audio: new Audio('./sounds/new-record.mp3'),
      volume: 10,
      isLoop: false,
    },
    /** 正解サウンド */
    pass: {
      audio: new Audio('./sounds/pass.mp3'),
      volume: 10,
      isLoop: false,
    },
    /** 不正解サウンド */
    fail: {
      audio: new Audio('./sounds/fail.mp3'),
      volume: 10,
      isLoop: false,
    },
  };

  private initialized = false;

  /**
   * サウンドを準備する。
   * @param nameToPlayNow この時点で鳴らしたいサウンドがあれば指定する
   */
  public prepareSounds(nameToPlayNow?: SoundType): void {
    // 初回以外の処理
    if (this.initialized) {
      if (nameToPlayNow != null) {
        this.playSound(nameToPlayNow);
      }
      return;
    }

    // サウンド読み込み＆初期設定
    for (const kv of Object.entries(this._SOUNDS)) {
      const key = kv[0];
      const sound = kv[1];
      sound.audio.load();
      sound.audio.loop = sound.isLoop;
      const volume = Math.min(1.0, Math.max(0.0, sound.volume / 100));
      sound.audio.volume = volume;
      sound.audio.play();
      if (nameToPlayNow == null || nameToPlayNow !== key) {
        sound.audio.pause();
      }
      Log.write(`[prepareSounds] sound[${sound.audio.baseURI}] volume=${volume}`);
    }
    this.initialized = true;
  }

  /**
   * サウンドを再生する
   * @param soundName 再生するサウンドの名称
   * @param onEndOnce [オプション] 再生終了時に行う処理（本設定は処理後に削除される）
   */
  public playSound(soundName: SoundType, onEndOnce?: () => void): void {
    const sound = this._SOUNDS[soundName];
    sound.audio.currentTime = 0;
    if (onEndOnce != null) {
      sound.audio.onended = _ => {
        onEndOnce();
        sound.audio.onended = null;
      };
    }
    sound.audio.play();
  }

  /** 全てのサウンドを停止する */
  public stopAllSounds(): void {
    for (const sound of Object.values(this._SOUNDS)) {
      sound.audio.pause();
    }
  }
}

/**
 * サウンドの種類につけた名前
 */
type SoundType = 'pass' | 'fail' | 'start' | 'finish' | 'newRecord';

/**
 * サウンド情報
 */
type SoundData = {
  audio: HTMLAudioElement,
  volume: number,
  isLoop: boolean,
}


/**
 * ――――――――――――――――――――――――――――――
 * （ある程度）永続的に保存される設定。実質上はハイスコア情報。
 * ――――――――――――――――――――――――――――――
 */
class AppConfig {
  readonly MAX_RECORDS = 10;

  // singleton
  public static obj(): AppConfig {
    if (this._obj == null) {
      this._obj = new AppConfig();
    }
    return this._obj;
  }
  private static _obj: AppConfig | undefined;
  // (end of singleton)

  // static constructor (like)
  static ctor = (() => {
    this._obj = new AppConfig();
  })();

  public static get(): Config {
    return {...this.obj().appConfig};
  }

  public static getHighScore(): ScoreData {
    const cfg = this.obj().appConfig;
    let ix = -1;
    let max = -1;
    cfg.highScores.forEach((highscore, index) => {
      if (highscore.letters > max) {
        ix = index;
        max = highscore.letters;
      }
    });
    if (ix >= 0) {
      return cfg.highScores[ix]!;
    } else {
      return {
        letters: 0,
        phrases: 0,
        typos: 0,
        timestamp: 0,
      }
    }
  }

  /** 設定値を保存する際のキー文字列 */
  readonly STORAGE_KEY = "HenkanTrainer"

  private appConfig: Config = this.loadConfig();

  /** デフォルト設定を生成する */
  public getConfigDefault(): Config {
    return {
      highScores: [],
      recentScores: [],
    };
  }

  /** 設定を保存する */
  public saveConfig(config: Config): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    Log.write(`saved config : ${JSON.stringify(config)}`);
  }

  /** 設定を取得する */
  public loadConfig(): Config {
    try {
      const text = localStorage.getItem(this.STORAGE_KEY);
      if (text != null) {
        const obj = JSON.parse(text);
        Log.write(`[loadConfig] loaded config=${JSON.stringify(obj)}`)
        const config = this.getConfigDefault();

        if (Array.isArray(obj?.highScores)) {
          for (const score of obj?.highScores) {
            if (
              Util.isNumber(score?.letters) 
              && Util.isNumber(score?.phrases)
              && Util.isNumber(score?.typos) 
              && Util.isNumber(score?.timestamp)
            ) {
              config.highScores.push({
                letters: score.letters,
                phrases: score.phrases,
                typos: score.typos,
                timestamp: score.timestamp,
              });
            }
          }
        }

        if (Array.isArray(obj?.recentScores)) {
          for (const score of obj?.recentScores) {
            if (
              Util.isNumber(score?.letters) 
              && Util.isNumber(score?.phrases)
              && Util.isNumber(score?.typos) 
              && Util.isNumber(score?.timestamp)
            ) {
              config.recentScores.push({
                letters: score.letters,
                phrases: score.phrases,
                typos: score.typos,
                timestamp: score.timestamp,
              });
            }
          }
        }

        Log.write(`config loaded : ${JSON.stringify(config)}`);
        return config;
      }
    } catch(err) {
      Log.write(`error in config-load : ${err}`);
    }
    Log.write('no config');
    return this.getConfigDefault();
  }

  /**
   * 練習結果を登録する
   * @param letters 今回の文字数
   * @param phrases 今回のフレーズ数
   * @param typos 今回のミス数
   * @param timestamp 今回の開始時タイムスタンプ
   * @returns 今回の順位（１はじまり。ランキング外なら負数。よってゼロにはならない）
   */
  public addNewScore(
    letters: number, 
    phrases: number, 
    typos: number,
    timestamp: number, 
  ): number {
    const newData: ScoreData = {
      letters,
      phrases,
      typos,
      timestamp,
    };

    // 最近のスコアの改訂
    const newLength = this.appConfig.recentScores.unshift(newData);
    if (newLength > this.MAX_RECORDS) {
      this.appConfig.recentScores.slice(this.MAX_RECORDS);
    }

    // ハイスコアの改訂
    this.appConfig.highScores.push(newData);
    this.appConfig.highScores.sort((a,b) => b.letters - a.letters);
    if (this.appConfig.highScores.length > this.MAX_RECORDS) {
      this.appConfig.highScores.slice(this.MAX_RECORDS);
    }
    const ixNewData = this.appConfig.highScores.findIndex(score => score.timestamp === timestamp);

    // データ保存
    this.saveConfig(this.appConfig);

    return (ixNewData < 0) ? ixNewData : (ixNewData + 1);
  }

  public clearRecords(): void {
    this.appConfig.highScores.splice(0);
    this.appConfig.recentScores.splice(0);
  }
}

/**
 * 単一のスコア記録
 */
type ScoreData = {
  letters: number,
  phrases: number,
  typos: number,
  timestamp: number,
}

/**
 * 設定の型
 */
type Config = {
  highScores: ScoreData[],
  recentScores: ScoreData[],
};



/**
 * 問題文を登録単語とそれ以外で分割したもの
 */
type PhraseToken = {
  text: string,
  isShortcut: boolean,
};

/**
 * ――――――――――――――――――――――――――――――
 * 問題文情報
 * ――――――――――――――――――――――――――――――
 */
class PhraseManager {
  // singleton
  public static obj(): PhraseManager {
    if (this._obj == null) {
      this._obj = new PhraseManager();
    }
    return this._obj;
  }
  private static _obj: PhraseManager | undefined;
  // (end of singleton)
  
  /**
   * 項目のインデックスを出題順に並べたもの。
   * 出題のたびに先頭から抜き出すので配列の項目数は変動する。
   */
  private readonly questionIds: number[] = [];

  public init(): void {
    if (this.questionIds.length > 0) {
      this.questionIds.splice(0);
    }
  }

  public getNextQuestionObject(): {text: string, elements: HTMLSpanElement[]} {
    const phrase = this.getNextQuestion();
    const tokens = this.getNextQuestionTokens(phrase);
    // フレーズの末尾に全角空白を追加（入力語句がフレーズをオーバーした場合にエラー表示するため）
    // ちなみに半角空白だと表示されないので使えない。
    tokens.push({
      text: '　', isShortcut: false,
    })
    const elements: HTMLSpanElement[] = [];
    tokens.forEach(token => {
      const graphemes = Util.divideGraphemes(token.text);
        for (const grapheme of graphemes) {
        const el = document.createElement('span');
        el.textContent = grapheme;
        if (token.isShortcut) {
          el.classList.add('shortcut');
        }
        elements.push(el);
      }
    });
    return {
      text: phrase,
      elements: elements,
    };
  }

  private getNextQuestionTokens(phrase: string): PhraseToken[] {
    const phrases:PhraseToken[] = [
      {text: phrase, isShortcut: false}
    ];

    for (const shortcut of this.SHORTCUTS) {
      while(true) {
        const ixToken = phrases.findIndex(
          token => token.isShortcut !== true && token.text.includes(shortcut)
        );
        if (ixToken < 0) break;
        // phrases[ixToken] が shortcut を含むので分割
        const divided: PhraseToken[] = [];
        const tokenText = phrases[ixToken]!.text;
        const ixText = tokenText.indexOf(shortcut); // phrases[ixToken]は絶対ある
        // 登録単語の手前の文字列を追加
        if (ixText > 0) {
          divided.push({text: tokenText.substring(0, ixText), isShortcut: false});
        }
        divided.push({text: shortcut, isShortcut: true});
        // 登録単語部分
        const ixNext = ixText + shortcut.length;
        // 登録単語の後
        if (ixNext < tokenText.length) {
          divided.push({text: tokenText.substring(ixNext), isShortcut: false});
        }
        // 配列を登録単語などの部分に置き換え
        phrases.splice(ixToken, 1, ...divided);
      }
    }
    return phrases;
  }

  private getNextQuestion(): string {
    if (this.questionIds.length < 1) {
      this.fillQuestionIdsRandomly();
    }
    const nextId = this.questionIds.shift();
    const nextPhrase = this.PHRASES.at(nextId ?? -1);
    if (nextPhrase == null) {
      throw new Error('(impossible case) questionId is null!');
    }

    return nextPhrase;
  }

  private fillQuestionIdsRandomly(): void {
    if (this.questionIds.length > 0) return;

    const idSeq = Util.generateArithmeticSequence(0, this.PHRASES.length);
    const idShuffled = Util.shuffleArray(idSeq);
    Log.write(`[fillQuestionIdsWithRandom] shuffled=${JSON.stringify(idShuffled)}`);
    this.questionIds.push(...idShuffled);
  }

  // ========== ========== 登録単語処理 ========== ==========

  private readonly SHORTCUTS = [
    "難聴者",
    "健聴者",
    "伝音難聴",
    "感音難聴",
    "情報保障",
    "補聴器",
    "人工内耳",
    "要約筆記者",
    "要約筆記",
    "聴覚障害者",
    "聴覚障害",
    "中途失聴者",
    "中途失聴",
    "失聴",
    "バリアフリー",
    "コミュニケーション",
    "ボランティア",
    "ユニバーサルデザイン",
    "ノーマライゼーション",
    "ありがとうございます。",
    "ありがとうございました。",
    "質問はありませんか？",
    "よろしくお願いします。",
  ] as const satisfies string[];

  // ========== ========== 出題フレーズそのもの ========== ==========

  private readonly PHRASES = [
    "情報保障者の皆さま、ありがとうございました。",
    "聴覚障害の原因はさまざま。",
    "聴覚障害者への情報保障をよろしくお願いします。",
    "聴覚障害はコミュニケーション障害です。",
    "講演会に手話通訳と要約筆記をつける。",
    "健聴者への啓発が必要だ。",
    "右耳に補聴器をつけている。",
    "ユニバーサルデザインのまちづくりを推進。",
    "欠格条項の廃止で聴覚障害者も免許が取れた。",
    "私は中途失聴者です。",
    "「中途失聴」は、難聴者運動でできた言葉。",
    "中途失聴者の団体に、要約筆記者を派遣する。",
    "昨日はボランティア集会に参加した。",
    "ご意見よろしくお願いします。",
    "中途失聴者は、以前は健聴者だった。",
    "伝音難聴には補聴器が有効。",
    "難聴者協会の会員の多くは感音難聴だ。",
    "耳硬化症による伝音難聴。",
    "要約筆記者の養成は県の事業だ。",
    "補聴器はフィッティングが大事。",
    "補聴器と人工内耳の違いは何か。",
    "人工内耳になっても聴覚障害の等級は下がらない。",
    "補聴器も人工内耳も、お手入れは大事。",
    "ＦＡＸは聴覚障害者用通信装置に該当する。",
    "私は感音難聴と伝音難聴をあわせもっている。",
    "補聴器をＦＡＸで注文する。",
    "バリアフリーとユニバーサルデザインの違い。",
    "先生に質問はありませんか？",
    "ボランティアとは、自発的という意味。",
    "認定補聴器専門店で補聴器を買う。",
    "要約筆記の体験講座があります。",
    "手書き要約筆記者は対人支援の要です。",
    "パソコン要約筆記には、いすと机が必要。",
    "コミュニケーションのバリアフリーを考える。",
    "要約筆記はコミュニケーション支援です。",
    "本日はありがとうございました。",
    "難聴者同士のコミュニケーションは難しい。",
    "先天性の難聴者と中途失聴者では、抱える問題の種類が違う。",
    "お気遣いありがとうございます。",
    "北欧はノーマライゼーションの発祥の地。",
    "コミュニケーションが不足している。",
    "人工内耳にしても、音入れをするまで何も聞こえない。",
    "福祉関係のボランティアに応募する。",
    "若い聴覚障害者の多くは、もうＦＡＸを持っていない。",
    "中途失聴なので手話は分かりません。",
    "難聴者向けの手話教室は木曜日です。",
    "聴覚障害者支援センターは津市にある。",
    "感音難聴が悪化したので人工内耳を検討する。",
    "「週刊手話ニュース」は情報保障が充実。",
    "ご参加ありがとうございます。",
    "音声情報バリアフリーの社会を目指して。",
    "全難聴の「難聴者の明日」は年４回の季刊。",
    "難聴者向けの読話教室がほしい。",
    "要約筆記者の派遣は市町村の必須事業。",
    "ノーマライゼーションとは、聴覚障害者を聞こえるようにすることではない。",
    "犬にかみつかれて失聴した人を知っている。",
    "「目で聴くテレビ」について、質問はありませんか？",
    "アイドラゴンは、聴覚障害者用情報受信装置だ。",
    "行政のユニバーサルデザイン政策として「手話リンク」を取り入れた。",
    "電話リレーサービスの導入で、コミュニケーションがスムーズになった。",
    "ヨメテルは、難聴者・中途失聴者が主な対象。",
    "中途失聴者や難聴者にも手話を使う人はいる。",
    "字幕放送はノーマライゼーションの一環。",
    "津波フラッグは、聴覚障害者にも分かりやすい。",
    "ヒアリングループがあるので、補聴器をＴかＭＴに切りかえて。",
    "障害者手帳で、補聴器の助成が受けられる。",
    "「ノーマライゼーション」という月刊誌がある。",
    "片耳だけの失聴だが、人工内耳にできた。",
    "聴覚障害がない人を健聴者という。",
    "盲ろう者の情報保障手段はさまざまだ。",
  ] as const;
}
