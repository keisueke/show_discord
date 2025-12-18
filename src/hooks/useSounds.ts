import { useEffect, useRef, useState, useCallback } from 'react';
import { Howl, Howler } from 'howler';

export type SoundName =
    | 'bgm_lobby'
    | 'bgm_game'
    | 'se_start'
    | 'se_question'
    | 'se_drumroll'
    | 'se_result'
    | 'se_result_normal'
    | 'se_result_double'
    | 'se_cheer'
    | 'se_buzzer'
    | 'se_countdown';

// ロビー用BGMのパス配列（ランダム再生用）
const LOBBY_BGM_PATHS = [
    './sounds/bgm_lobby_1.mp3',
    './sounds/bgm_lobby_2.mp3',
];

const SOUND_PATHS: Record<SoundName, string> = {
    bgm_lobby: './sounds/bgm_lobby.mp3', // このパスは使用されません（ランダム選択のため）
    bgm_game: './sounds/bgm_game.mp3',
    se_start: './sounds/se_start.mp3',
    se_question: './sounds/se_question.mp3',
    se_drumroll: './sounds/se_drumroll.mp3',
    se_result: './sounds/se_result.mp3',
    se_result_normal: './sounds/se_result_normal.mp3',
    se_result_double: './sounds/se_result_double.mp3',
    se_cheer: './sounds/se_cheer.mp3',
    se_buzzer: './sounds/se_buzzer.mp3',
    se_countdown: './sounds/se_countdown.mp3',
};

// BGM音量のデフォルト値とlocalStorageキー
const DEFAULT_BGM_VOLUME = 0.5; // 50%
const BGM_VOLUME_STORAGE_KEY = 'bgm_volume';

// localStorageからBGM音量を読み込む
const loadBgmVolume = (): number => {
    try {
        const saved = localStorage.getItem(BGM_VOLUME_STORAGE_KEY);
        if (saved !== null) {
            const volume = parseFloat(saved);
            if (!isNaN(volume) && volume >= 0 && volume <= 1) {
                return volume;
            }
        }
    } catch (e) {
        console.warn('Failed to load BGM volume from localStorage', e);
    }
    return DEFAULT_BGM_VOLUME;
};

export const useSounds = () => {
    const [muted, setMuted] = useState(false);
    const [bgmVolume, setBgmVolumeState] = useState<number>(loadBgmVolume);
    const bgmRef = useRef<Howl | null>(null);
    const currentBgmName = useRef<SoundName | null>(null);
    const lastLobbyBgmIndex = useRef<number>(-1); // 前回再生したロビーBGMのインデックス
    const bgmVolumeRef = useRef<number>(bgmVolume); // 最新の音量を保持するref

    // Initialize global mute state
    useEffect(() => {
        Howler.mute(muted);
    }, [muted]);

    // bgmVolumeが変更されたときにrefも更新
    useEffect(() => {
        bgmVolumeRef.current = bgmVolume;
    }, [bgmVolume]);

    // BGM音量を変更する関数
    const setBgmVolume = useCallback((volume: number) => {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        setBgmVolumeState(clampedVolume);
        bgmVolumeRef.current = clampedVolume; // refも更新
        
        // localStorageに保存
        try {
            localStorage.setItem(BGM_VOLUME_STORAGE_KEY, clampedVolume.toString());
        } catch (e) {
            console.warn('Failed to save BGM volume to localStorage', e);
        }
        
        // 現在再生中のBGMの音量も即座に更新
        if (bgmRef.current && bgmRef.current.playing()) {
            bgmRef.current.volume(clampedVolume);
        }
    }, []);

    const playSE = useCallback((name: SoundName) => {
        const sound = new Howl({
            src: [SOUND_PATHS[name]],
            volume: 0.6,
        });
        sound.play();
    }, []);

    const playBGM = useCallback((name: SoundName) => {
        // ロビーBGMの場合はランダムに選択
        let bgmPath: string;
        if (name === 'bgm_lobby') {
            // 前回と異なる曲を選択（2曲の場合）
            let randomIndex: number;
            if (LOBBY_BGM_PATHS.length > 1 && lastLobbyBgmIndex.current >= 0) {
                // 前回と異なるインデックスを選択
                do {
                    randomIndex = Math.floor(Math.random() * LOBBY_BGM_PATHS.length);
                } while (randomIndex === lastLobbyBgmIndex.current);
            } else {
                randomIndex = Math.floor(Math.random() * LOBBY_BGM_PATHS.length);
            }
            lastLobbyBgmIndex.current = randomIndex;
            bgmPath = LOBBY_BGM_PATHS[randomIndex];
            console.log('[BGM] Selected lobby BGM:', bgmPath, 'index:', randomIndex);
        } else {
            bgmPath = SOUND_PATHS[name];
        }

        // 既に同じBGMが再生中の場合は何もしない（ロビーBGMも含む）
        if (currentBgmName.current === name && bgmRef.current?.playing()) {
            // ロビーBGMの場合は、同じパスかどうかも確認
            if (name === 'bgm_lobby' && bgmRef.current) {
                const currentSrc = (bgmRef.current as any)._src;
                if (currentSrc && currentSrc[0] === bgmPath) {
                    // 同じ曲が再生中の場合は何もしない
                    console.log('[BGM] Same lobby BGM already playing, skipping');
                    return;
                }
            } else {
                // 同じBGM名で再生中なら何もしない
                return;
            }
        }

        // 既存のBGMを確実に停止（重複再生を防ぐ）
        if (bgmRef.current) {
            const oldBgm = bgmRef.current;
            // フェードアウト中でも即座に停止
            oldBgm.stop();
            bgmRef.current = null;
            currentBgmName.current = null;
        }

        // Start new BGM
        const newBgm = new Howl({
            src: [bgmPath],
            loop: true,
            volume: 0, // Start at 0 for fade in
        });

        newBgm.play();
        // 最新のbgmVolumeRefを参照してフェードイン
        newBgm.fade(0, bgmVolumeRef.current, 1000);

        bgmRef.current = newBgm;
        currentBgmName.current = name;
    }, []); // bgmVolumeRefを使用するため依存配列は空

    const stopBGM = useCallback(() => {
        if (bgmRef.current) {
            // 最新のbgmVolumeRefを参照
            bgmRef.current.fade(bgmVolumeRef.current, 0, 1000);
            setTimeout(() => {
                bgmRef.current?.stop();
                bgmRef.current = null;
                currentBgmName.current = null;
            }, 1000);
        }
    }, []); // bgmVolumeStateを依存配列から削除（関数内で直接参照）

    const toggleMute = useCallback(() => {
        setMuted(prev => !prev);
    }, []);

    return {
        playSE,
        playBGM,
        stopBGM,
        toggleMute,
        muted,
        bgmVolume,
        setBgmVolume
    };
};
