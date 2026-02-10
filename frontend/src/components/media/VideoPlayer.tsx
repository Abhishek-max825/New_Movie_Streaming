import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import 'plyr-react/plyr.css';
import Plyr, { APITypes } from 'plyr-react';

interface Props {
    src: string;
    poster?: string;
    autoPlay?: boolean;
    duration?: number; // Duration in seconds
    onEnded?: () => void;
}

// Language code mapping
const langMap: Record<string, string> = {
    'hin': 'Hindi', 'eng': 'English', 'kan': 'Kannada', 'tel': 'Telugu',
    'tam': 'Tamil', 'mal': 'Malayalam', 'spa': 'Spanish', 'fre': 'French',
    'ger': 'German', 'ita': 'Italian', 'jpn': 'Japanese', 'kor': 'Korean',
    'chi': 'Chinese', 'rus': 'Russian', 'und': 'Unknown'
};

// Inject audio selector into Plyr settings menu
// Inject audio selector into Plyr settings menu
function injectAudioSelector(hls: Hls, tracks: any[], rootElement: HTMLElement | null): () => void {
    if (!tracks || tracks.length === 0 || !rootElement) {
        return () => { };
    }



    const inject = () => {
        if (!rootElement.isConnected) return;

        const menu = rootElement.querySelector('.plyr__menu');
        const container = menu?.querySelector('.plyr__menu__container');

        if (!menu || !container) return;

        // Check if already injected and valid
        if (container.querySelector('#plyr-audio-menu') && container.querySelector('#plyr-audio-control')) {
            return;
        }

        // Locate the Home pane reliably
        // Plyr creates multiple divs inside container.
        // - First one (visible initially) is the main menu.
        // - Others are submenus (Quality, Speed, etc.).
        // We want to inject into the FIRST div, which contains the main settings.

        const panes = Array.from(container.children).filter(c => c.tagName === 'DIV');
        if (panes.length === 0) return;

        // Usually the first pane is the home pane.
        // But to be safe, let's find the pane that contains "Speed" OR "Quality" OR "Captions".
        // If not found, fallback to the first pane.
        let homePane = panes.find(pane => {
            const buttons = Array.from(pane.querySelectorAll('button'));
            return buttons.some(btn => {
                const text = btn.textContent?.trim() || '';
                return text.includes('Speed') || text.includes('Quality') || text.includes('Captions');
            });
        }) as HTMLElement | undefined;

        if (!homePane) {
            console.log("AudioInjection: Could not find specific Home pane by text, falling back to first pane.");
            homePane = panes[0] as HTMLElement;
        }

        console.log("AudioInjection: Injecting Audio Menu...");

        // --- 1. Create Main Menu Button ---
        // Remove existing if any (cleanup for re-injection)
        const oldBtn = homePane.querySelector('#plyr-audio-control');
        if (oldBtn) oldBtn.remove();

        const audioBtn = document.createElement('button');
        audioBtn.type = 'button';
        audioBtn.id = 'plyr-audio-control';
        audioBtn.className = 'plyr__control plyr__control--forward';
        audioBtn.role = 'menuitem';
        audioBtn.setAttribute('aria-haspopup', 'true');
        audioBtn.innerHTML = `
            <span>Audio</span>
            <span class="plyr__menu__value">Default</span>
        `;

        // Insert after the last "forward" control (Speed, Quality, etc.) to keep it grouped
        const forwardControls = Array.from(homePane.querySelectorAll('.plyr__control--forward'));
        if (forwardControls.length > 0) {
            const lastForward = forwardControls[forwardControls.length - 1];
            if (lastForward.nextSibling) {
                homePane.insertBefore(audioBtn, lastForward.nextSibling);
            } else {
                homePane.appendChild(audioBtn);
            }
        } else {
            // No other forward controls? Just append.
            homePane.appendChild(audioBtn);
        }

        // --- 2. Create Sub-menu Pane ---
        // Remove existing if any
        const oldMenu = container.querySelector('#plyr-audio-menu');
        if (oldMenu) oldMenu.remove();

        const audioPane = document.createElement('div');
        audioPane.id = 'plyr-audio-menu';
        // DO NOT add 'plyr__menu__container' class here, it causes nested padding/background issues.
        // It should just be a pane container.
        audioPane.hidden = true;
        audioPane.style.width = '100%';
        audioPane.style.minWidth = '200px'; // Make sure the menu is wide enough 
        audioPane.style.display = 'flex';
        audioPane.style.flexDirection = 'column';

        // Add back button with explicit SVG structure to ensure icon renders
        audioPane.innerHTML = `
            <div style="margin-bottom: 8px;">
                <button type="button" class="plyr__control plyr__control--back">
                    <span class="plyr__sr-only">Go back to previous menu</span>
                    <span class="plyr__menu__label">Audio</span>
                </button>
            </div>
            <div class="plyr__menu__content" style="display: flex; flex-direction: column; width: 100%;"></div>
        `;

        // Append to the main container (where other panes live)
        container.appendChild(audioPane);

        const contentDiv = audioPane.querySelector('.plyr__menu__content');
        if (!contentDiv) return;

        // --- 3. Populate Audio Tracks ---
        tracks.forEach((track, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            // Use same styling as other menu items
            button.className = 'plyr__control';
            button.role = 'menuitemradio';
            button.setAttribute('aria-checked', index === hls.audioTrack ? 'true' : 'false');

            // Check if track object has meaningful name
            const langName = langMap[track.lang] || track.lang;
            let label = langName;

            // Fallback logic for label
            if (!label || label === 'undefined' || label === 'und') {
                label = track.name && !track.name.startsWith('audio_') ? track.name : `Audio ${index + 1}`;
            }

            // Create badge/layout matching Plyr's style
            button.innerHTML = `
                <span>${label}</span>
            `; // Removed empty value span as it's not needed for radio items usually

            button.addEventListener('click', () => {
                console.log(`AudioInjection: Switching to track ${index} (${label})`);
                hls.audioTrack = index;
                updates(index);
                showHome();
            });

            contentDiv.appendChild(button);
        });

        // --- 4. Navigation Handlers ---
        const showAudio = () => {
            Array.from(container.children).forEach(child => {
                if (child.tagName === 'DIV') (child as HTMLElement).hidden = true;
            });
            audioPane.hidden = false;
        };

        const showHome = () => {
            audioPane.hidden = true;
            if (homePane) homePane.hidden = false;
        };

        audioBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showAudio();
        });

        const backBtn = audioPane.querySelector('.plyr__control--back');
        if (backBtn) {
            backBtn.addEventListener('click', () => showHome());
        }

        // --- 5. UI Helper ---
        const updates = (trackId: number) => {
            updateAudioUI(trackId, tracks, contentDiv as HTMLElement, audioBtn);
        };

        updates(hls.audioTrack);

        // Track switch listener (scoped to this injection)
        const onTrackSwitch = (_event: any, data: any) => updates(data.id);
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, onTrackSwitch);

        // Cleanup HLS listener when elements are removed
        // (Handled by the main cleanup function below)
    };

    // Initial check
    inject();

    // Observe changes in the player wrapper
    const observer = new MutationObserver(() => {
        inject();
    });

    observer.observe(rootElement, {
        childList: true,
        subtree: true
    });

    return () => {
        observer.disconnect();
        console.log("AudioInjection: Cleanup (Observer disconnected).");
        if (rootElement) {
            const audioMenu = rootElement.querySelector('#plyr-audio-menu');
            if (audioMenu) audioMenu.remove();
            const audioBtn = rootElement.querySelector('#plyr-audio-control');
            if (audioBtn) audioBtn.remove();
        }
    };
}

// Update UI when audio track changes
function updateAudioUI(trackId: number, tracks: any[], contentDiv: HTMLElement, audioBtn: HTMLElement) {
    const buttons = contentDiv.querySelectorAll('button');
    buttons.forEach((btn, idx) => {
        if (idx === trackId) {
            btn.setAttribute('aria-checked', 'true');
            btn.classList.add('plyr__control--pressed');
        } else {
            btn.setAttribute('aria-checked', 'false');
            btn.classList.remove('plyr__control--pressed');
        }
    });

    const track = tracks[trackId];
    if (!track) return;

    const langName = langMap[track.lang] || track.lang;
    let trackName = langName;
    if (!trackName) {
        trackName = track.name && !track.name.startsWith('audio_') ? track.name : `Audio ${trackId + 1}`;
    }

    const valueSpan = audioBtn.querySelector('.plyr__menu__value');
    if (valueSpan) valueSpan.textContent = trackName;
}

export const VideoPlayer = ({ src, poster, autoPlay = false, duration, onEnded }: Props) => {
    const ref = useRef<APITypes>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    // Mobile rotation prompt state
    const [showRotatePrompt, setShowRotatePrompt] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isPortrait, setIsPortrait] = useState(false);

    // Detect mobile and orientation
    useEffect(() => {
        const checkMobileAndOrientation = () => {
            const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const portrait = window.innerHeight > window.innerWidth;

            setIsMobile(mobile);
            setIsPortrait(portrait);

            // Show rotation prompt if mobile and portrait
            if (mobile && portrait && autoPlay) {
                setShowRotatePrompt(true);
                // Auto-hide after 5 seconds
                setTimeout(() => setShowRotatePrompt(false), 5000);
            }
        };

        checkMobileAndOrientation();
        window.addEventListener('resize', checkMobileAndOrientation);
        window.addEventListener('orientationchange', checkMobileAndOrientation);

        return () => {
            window.removeEventListener('resize', checkMobileAndOrientation);
            window.removeEventListener('orientationchange', checkMobileAndOrientation);
        };
    }, [autoPlay]);

    useEffect(() => {
        let hls: Hls | null = null;
        let timer: NodeJS.Timeout;
        let cleanupAudioInjection: (() => void) | null = null;

        const loadVideo = () => {
            // Scope video selection to this component instance
            const video = wrapperRef.current?.querySelector('video') as HTMLVideoElement;
            if (!video) return;

            if (Hls.isSupported()) {
                hls = new Hls({
                    // Add some robust error handling configs if needed
                    enableWorker: true,
                    lowLatencyMode: true,
                    xhrSetup: (xhr, url) => {
                        // Bypass tunnel warning pages (ngrok, etc)
                        xhr.setRequestHeader('ngrok-skip-browser-warning', 'true');
                        xhr.setRequestHeader('Bypass-Tunnel-Reminder', 'true');
                    }
                });
                hlsRef.current = hls;

                hls.loadSource(src);
                hls.attachMedia(video);
                (window as any).hls = hls;

                hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                    if (autoPlay) video.play().catch(() => { });
                    const tracks = data.audioTracks || hls?.audioTracks;
                    console.log("Manifest Parsed. Tracks found:", tracks);

                    if (cleanupAudioInjection) cleanupAudioInjection(); // Clear previous if any

                    if (tracks && tracks.length >= 1 && hls) {
                        cleanupAudioInjection = injectAudioSelector(hls, tracks, wrapperRef.current);
                    }
                });

                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                hls?.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls?.recoverMediaError();
                                break;
                            default:
                                hls?.destroy();
                                break;
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = src;
                if (autoPlay) video.play().catch(() => { });
            }
        };

        timer = setTimeout(loadVideo, 1000);

        return () => {
            clearTimeout(timer);
            if (hls) {
                console.log("Cleaning up HLS instance safely...");
                hls.detachMedia();
                hls.destroy();
                hls = null;
                hlsRef.current = null;
                if ((window as any).hls) delete (window as any).hls;
            }
            if (cleanupAudioInjection) {
                cleanupAudioInjection();
            }
        };
    }, [src, autoPlay]);

    // Use a unique key to force Plyr to re-initialize when source or duration changes
    const playerKey = `${src}-${duration || 0}`;

    return (
        <div ref={wrapperRef} className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative">
            <Plyr
                key={playerKey}
                ref={ref}
                source={{
                    type: 'video',
                    sources: [],
                    poster: poster,
                }}
                options={{
                    controls: [
                        'play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
                    ],
                    autoplay: autoPlay,
                    invertTime: false,
                    displayDuration: true,
                    duration: duration,
                }}
                onEnded={onEnded}
            />

            {/* Mobile Rotation Prompt Overlay */}
            {showRotatePrompt && isMobile && isPortrait && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="text-center space-y-4 px-6">
                        <div className="flex justify-center">
                            <svg
                                className="w-16 h-16 text-[#E50914] animate-rotate-pulse"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-white font-bold text-xl">Rotate Your Device</h3>
                            <p className="text-gray-300 text-sm">Turn your phone horizontally for the best viewing experience</p>
                        </div>
                        <button
                            onClick={() => setShowRotatePrompt(false)}
                            className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-sm font-medium transition-colors"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}

            {/* Direct Style Injection to Override Plyr Defaults */}
            <style jsx global>{`
                /* Force correct Netflix Red */
                :root {
                --plyr-color-main: #E50914 !important;
                --plyr-video-control-color: #e5e5e5;
                --plyr-range-track-height: 3px;
                --plyr-range-thumb-height: 14px;
                --plyr-range-thumb-width: 14px;
                --plyr-range-thumb-background: #fff;
                --plyr-range-thumb-shadow: 0 1px 4px rgba(0,0,0,0.5);
                --plyr-range-fill-background: #E50914 !important;
                --plyr-menu-background: rgba(20, 20, 20, 0.95);
                --plyr-menu-color: #fff;
                }

                /* Enforce THIN track */
                .plyr--full-ui input[type=range]::-webkit-slider-runnable-track {
                height: 3px !important;
                background: rgba(255, 255, 255, 0.25) !important;
                }
                .plyr--full-ui input[type=range]::-moz-range-track {
                height: 3px !important;
                background: rgba(255, 255, 255, 0.25) !important;
                }
                .plyr--full-ui input[type=range]::-ms-track {
                height: 3px !important;
                background: rgba(255, 255, 255, 0.25) !important;
                }
                
                /* Enforce WHITE SHADOW THUMB */
                .plyr--full-ui input[type=range]::-webkit-slider-thumb {
                height: 14px !important;
                width: 14px !important;
                background: #fff !important;
                box-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
                margin-top: -5.5px !important;
                transform: scale(1);
                transition: transform 0.2s ease;
                }
                .plyr--full-ui input[type=range]::-moz-range-thumb {
                height: 14px !important;
                width: 14px !important;
                background: #fff !important;
                box-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
                }

                /* Hover Effect */
                .plyr--full-ui input[type=range]:active::-webkit-slider-thumb,
                .plyr__progress__container:hover input[type=range]::-webkit-slider-thumb {
                transform: scale(1.3) !important;
                }

                /* Play Button Static & Glow */
                .plyr__control--overlaid {
                background: rgba(229, 9, 20, 0.9) !important;
                transform: translate(-50%, -50%) !important; 
                }
                .plyr__control--overlaid:hover {
                background: #ff0a16 !important;
                box-shadow: 0 0 60px rgba(255, 10, 22, 0.8) !important;
                transform: translate(-50%, -50%) !important;
                }
                
                .plyr__menu__container {
                    background: rgba(20,20,20,0.95) !important;
                    place-content: flex-start !important;
                    flex-direction: column !important;
                    backdrop-filter: blur(20px) !important;
                    border-radius: 8px !important;
                    padding: 8px !important;
                    height: auto !important; /* Force auto height to show injected content */
                    max-height: 80vh !important; /* Cap height */
                    overflow-y: auto !important; /* Allow scrolling if too many items */
                }
                
                /* Standardize all menu items (Speed, Audio, Quality, etc.) */
                .plyr__menu__container .plyr__control {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: space-between !important;
                    width: 100% !important;
                    padding: 8px 12px !important;
                    margin: 2px 0 !important;
                    border-radius: 4px !important;
                    font-weight: 500 !important;
                }

                /* Hover states for menu items */
                .plyr__menu__container .plyr__control:hover {
                    background: rgba(255, 255, 255, 0.1) !important;
                }

                /* Fix alignment of label vs value */
                .plyr__menu__container .plyr__control > span:first-child {
                    text-align: left;
                    flex: 1;
                }
                
                .plyr__menu__container .plyr__control .plyr__menu__value {
                    opacity: 0.7;
                    margin-right: 4px;
                    font-size: 0.9em;
                }

                /* Highlight selected items in submenus */
                .plyr__menu__container .plyr__control[aria-checked="true"] {
                    background: rgba(229, 9, 20, 0.1) !important; 
                    color: #E50914 !important;
                }
                .plyr__menu__container .plyr__control[aria-checked="true"]::after {
                    background: #E50914 !important;
                    box-shadow: 0 0 8px #E50914 !important;
                }
                
                /* Rotation prompt animations */
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                @keyframes rotate-pulse {
                    0%, 100% { transform: rotate(0deg); opacity: 1; }
                    50% { transform: rotate(90deg); opacity: 0.8; }
                }
                
                .animate-fade-in {
                    animation: fade-in 0.3s ease-in;
                }
                
                .animate-rotate-pulse {
                    animation: rotate-pulse 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
};
