# Wolf-Eye

![Wolf-Eye](data/photos/logo-1.png)

Bir yapay zeka komuta sistemi. Gerçek zamanlı harita görselleştirmesi, drone yönetimi, yapay zeka görüş analizi ve taktik VR modunu tek bir arayüzde birleştirir.

## Özellikler

### 🗺️ Drone Modu (Harita Komuta)
- **Etkileşimli Harita** — Leaflet tabanlı karanlık OSM haritası, tıklanabilir marker'lar
- **Drone Takibi** — Gerçek zamanlı drone konumları, radar daireleri, batarya/hız bilgisi
- **Etiketli Hedefler** — Tag + renk seçimli hedef noktaları (kırmızı=tehdit, yeşil=dost)
- **İnsan İşaretleri** — Saha personelinin harita üzerinde konumları
- **Komut Paneli** — Objectives/Drones/Humans bölümleri, GPS koordinat düzenleme

### 🥽 VR Modu (3D Taktik Görüş)
- **3D Ortam** — Three.js/R3F ile shader tabanlı zemin grid'i, gökyüzü ve sis efekti
- **WASD Hareket** — İleri/geri/sola/sağa, Shift ile sprint, mouse ile bakış açısı
- **Hedef Beacon'ları** — 3D silindir + küre gösterimi, renk kodlu etiketler
- **Drone Beacon'ları** — Yüksek irtifalı dönen elmas şekli
- **Minimap** — Rotasyona duyarlı 160m yarıçaplı harita, marker'lar ve mesafe çizgileri
- **Pusula** — 0-360° yön şeridi, N/S/E/W gösterimi
- **Crosshair** — CS:GO tarzı hedefleme retiküsü
- **Sonar (Q tuşu)** — 500m içindeki varlıkları 5 saniye boyunca algılama
- **Kamera Görüntüsü** — AI analizinden gelen görüntü sağ alt köşede

### 🤖 Yapay Zeka Sistemi
- **Brain Orkestratörü** — Ollama (qwen3.5:4b) ile 10 adımlık otomatik tool-call döngüsü
- **Doğal Dil Komutları** — Türkçe/İngilizce: "200m içinde düşman var mı?", "drone1 ne görüyor?"
- **Hafıza** — Son 3 sohbet turunun saklanması

#### AI Araçları
| Araç | Tip | Açıklama |
|------|-----|----------|
| `query_data` | QUERY | Veritabanı sorgulama (drones, humans, comms, cameras) |
| `scan_area` | QUERY | Oyuncu çevresinde varlık taraması (tag/renk/mesafe) |
| `dispatch_drone` | ACTION | Koordinata en yakın drone'u gönder |
| `send_comms` | ACTION | WOLF-EYE olarak etiketli mesaj gönder |
| `get_camera_feed` | GET/FINAL | Kamera görüntüsünü al |
| `aim_at_target` | GET/FINAL | YOLO + PID servo ile hedefe kilitlen |

#### AI Ajanları
| Ajan | Açıklama |
|------|----------|
| `analyze_camera` | Kamera görüntüsü tehdit analizi (vision LLM) |
| `analyze_sitrep` | İletişim loglarından istihbarat analizi |

### 📡 Taktik İletişim
- **Etiketli Mesajlar** — civilian (mavi), enemy (kırmızı), friend (yeşil), military (amber)
- **Comms Paneli** — Sağ üst köşede 3 saniyede bir mesaj döngüsü
- **Flash Mesajlar** — Gönderilen mesajlar 5 saniye süreyle gösterilir
- **AI Mesaj Gönderme** — Brain üzerinden etiketli iletişim

### 🎯 Otomatik Nişan Sistemi
- **YOLO Nesne Tanıma** — Person, car, truck, bus algılama
- **PID Servo Simülasyonu** — Pan/Tilt kontrolü, hızlanma ve inertia
- **Hedef Kilitleme** — |error| < 4% eşiğinde LOCKED durumu
- **Annotated Görüntü** — Kırmızı bounding box, crosshair, servo HUD

### 💬 AI Chat
- **Enter ile Komut** — Her iki modda da AI sohbet paneli
- **Markdown Desteği** — GFM formatında yanıt gösterimi
- **Standart Yanıt Formatı** — `{ text, attachments: [{type, data, label}] }`
- **Görüntü Gösterimi** — AI'dan gelen görüntüler otomatik olarak sağ alt köşede

## Mimari

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, React-Leaflet, Three.js/R3F, Zustand |
| Backend | FastAPI, Python 3.13+, TinyDB (JSON), Pydantic |
| AI | Ollama (qwen3.5:4b) — tool calling, vision analizi, yapılandırılmış JSON |
| Algılama | YOLOv8n + PID servo simülasyonu |

## Hızlı Başlangıç

```bash
# Backend
cd backend
uv run python src/xMain.py

# Frontend
cd frontend
pnpm install
pnpm dev
```