import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";

interface LocationPickerMapProps {
    lat: number | null;
    lng: number | null;
    onChange: (lat: number, lng: number) => void;
    className?: string;
    addressToSearch?: string;
}

const LocationPickerMap: React.FC<LocationPickerMapProps> = ({ lat, lng, onChange, className, addressToSearch }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markerRef = useRef<maplibregl.Marker | null>(null);
    const maptilerKey = import.meta.env.VITE_MAPTILER_KEY;

    // Use HCMC as default center if no lat/lng
    const defaultLng = 106.660172;
    const defaultLat = 10.762622;

    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearchAddress = async () => {
        if (!addressToSearch || !maptilerKey) return;
        
        setIsSearching(true);
        try {
            const rawAddress = addressToSearch.replace(/\s+/g, ' ').trim();
            
            // Helper to strip accents & lowercase for robust Vietnamese comparison
            const stripVN = (s: string) => 
                (s || '')
                 .normalize('NFD')
                 .replace(/[\u0300-\u036f]/g, '')
                 .replace(/đ/g, 'd')
                 .replace(/Đ/g, 'D')
                 .toLowerCase();

            // Extract house number and clean street name
            const firstPart = rawAddress.split(',')[0].trim();
            const houseNumRegex = /^(\d+[a-zA-Z0-9\/-]*)\s+/;
            const houseMatch = firstPart.match(houseNumRegex);
            const houseNumStr = houseMatch ? houseMatch[1] : '';
            const targetHouseNum = houseNumStr ? parseInt(houseNumStr, 10) : null;
            const streetNameClean = firstPart.replace(houseNumRegex, '').trim() || firstPart;

            // Extract district keyword if present (e.g. "Quận 6", "Q.6", "Tân Bình", "Quận 1")
            const districtMatch = rawAddress.match(/(quận\s+\d+|quận\s+[a-zà-ỹ\s]+|huyện\s+[a-zà-ỹ\s]+|q\.\s*\d+|q\d+)/i);
            const districtName = districtMatch ? districtMatch[0].trim() : '';

            // Proximity: prefer current valid coordinates if available to prioritize same neighborhood
            const proximity = (lat !== null && lng !== null && lat !== 0 && lng !== 0)
                ? `${lng},${lat}`
                : '106.660172,10.762622';

            const queryMapTiler = async (q: string) => {
                const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${maptilerKey}&limit=10&country=vn&proximity=${proximity}`;
                const res = await fetch(url);
                const json = await res.json();
                return (json.features || []) as any[];
            };

            // Queries in order of precision:
            const queriesToTry: string[] = [];
            if (targetHouseNum && streetNameClean) {
                queriesToTry.push(`${targetHouseNum} ${streetNameClean}, ${districtName || 'Hồ Chí Minh'}`);
                queriesToTry.push(`${streetNameClean}, ${districtName || 'Hồ Chí Minh'}`);
                queriesToTry.push(`${streetNameClean}, Hồ Chí Minh`);
            } else {
                if (streetNameClean && districtName) {
                    queriesToTry.push(`${streetNameClean}, ${districtName}, Hồ Chí Minh`);
                }
                queriesToTry.push(`${rawAddress}, Hồ Chí Minh`);
                queriesToTry.push(`${streetNameClean}, Hồ Chí Minh`);
            }

            const allFeatures: any[] = [];
            const seenIds = new Set<string>();

            for (const q of queriesToTry) {
                const features = await queryMapTiler(q);
                if (features && features.length > 0) {
                    for (const f of features) {
                        if (!seenIds.has(f.id)) {
                            seenIds.add(f.id);
                            allFeatures.push(f);
                        }
                    }
                }
            }

            const streetNorm = stripVN(streetNameClean);
            const districtNorm = stripVN(districtName);

            // Filter features matching the street
            const validFeatures = allFeatures.filter((f: any) => {
                const textNorm = stripVN(f.text || '');
                const placeNorm = stripVN(f.place_name || '');
                const contextNorm = stripVN((f.context || []).map((c: any) => c.text || '').join(' '));
                const fullNorm = `${textNorm} ${placeNorm} ${contextNorm}`;

                const streetMatches = streetNorm ? fullNorm.includes(streetNorm) : false;
                if (!streetMatches) return false;

                if (districtNorm) {
                    const districtMatches = fullNorm.includes(districtNorm) || 
                        (districtNorm.includes('6') && (fullNorm.includes('binh tien') || fullNorm.includes('cho lon') || fullNorm.includes('phuong 1') || fullNorm.includes('phuong 3') || fullNorm.includes('phuong 14')));
                    if (!districtMatches && !fullNorm.includes('ho chi minh')) return false;
                }

                return true;
            });

            if (validFeatures.length === 0) {
                alert("Không tìm thấy kết quả tự động từ địa chỉ nhập. Vui lòng chấm tay trên bản đồ.");
                return;
            }

            // Score features to pick the closest house number or closest to existing pin
            let bestFeature: any = validFeatures[0];
            let bestScore = -999999;

            for (const f of validFeatures) {
                let score = 0;
                const text = f.text || '';
                const place = f.place_name || '';
                const full = `${text} ${place}`;

                const featNumMatch = full.match(/(?:Hẻm\s*|Số\s*)?(\d+)/i);
                const featNum = featNumMatch ? parseInt(featNumMatch[1], 10) : null;

                if (targetHouseNum !== null) {
                    if (featNum !== null) {
                        const diff = Math.abs(featNum - targetHouseNum);
                        score += Math.max(120 - diff * 0.4, 0);
                    } else {
                        score += 20;
                    }
                } else {
                    score += 50;
                }

                // Proximity bonus if user already had a valid pin on the map
                if (lat !== null && lng !== null && lat !== 0 && lng !== 0 && f.center) {
                    const [fLng, fLat] = f.center;
                    const distKm = Math.hypot(fLng - lng, fLat - lat) * 111;
                    if (distKm < 0.3) score += 40;
                    else if (distKm < 0.8) score += 20;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestFeature = f;
                }
            }

            if (bestFeature && bestFeature.center) {
                const [newLlng, newLlat] = bestFeature.center;
                
                // If user's existing pin is already on the exact same spot (< 35 meters), preserve manual precision
                if (lat !== null && lng !== null && lat !== 0 && lng !== 0) {
                    const distKm = Math.hypot(newLlng - lng, newLlat - lat) * 111;
                    if (distKm < 0.035) {
                        // Keep current pin and smoothly re-center
                        if (map.current) {
                            map.current.flyTo({ center: [lng, lat], zoom: 16 });
                        }
                        return;
                    }
                }

                onChange(newLlat, newLlng);
                if (map.current) {
                    map.current.flyTo({ center: [newLlng, newLlat], zoom: 16 });
                }
            } else {
                alert("Không tìm thấy kết quả tự động từ địa chỉ nhập. Vui lòng chấm tay trên bản đồ.");
            }
        } catch (error) {
            console.error("Geocoding map error:", error);
            alert("Đã có lỗi xảy ra khi tự động tìm địa chỉ.");
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        const initialLng = lng !== null ? lng : defaultLng;
        const initialLat = lat !== null ? lat : defaultLat;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`,
            center: [initialLng, initialLat],
            zoom: lat !== null ? 15 : 11, // Zoom closer if we already have a location
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        // Add a marker if we already have valid lat/lng
        if (lat !== null && lng !== null) {
            markerRef.current = new maplibregl.Marker({ color: "#e11d48", draggable: true })
                .setLngLat([lng, lat])
                .addTo(map.current);
            
            // Listen to marker drag events
            markerRef.current.on('dragend', () => {
                if (markerRef.current) {
                    const newLngLat = markerRef.current.getLngLat();
                    onChange(newLngLat.lat, newLngLat.lng);
                }
            });
        }

        // Add click event to map to set or move the marker
        map.current.on('click', (e) => {
            const { lng: clickLng, lat: clickLat } = e.lngLat;
            
            if (markerRef.current) {
                // Move existing marker
                markerRef.current.setLngLat([clickLng, clickLat]);
            } else if (map.current) {
                // Create new marker
                markerRef.current = new maplibregl.Marker({ color: "#e11d48", draggable: true })
                    .setLngLat([clickLng, clickLat])
                    .addTo(map.current);
                
                // Add drag listener to the new marker
                markerRef.current.on('dragend', () => {
                    if (markerRef.current) {
                        const newLngLat = markerRef.current.getLngLat();
                        onChange(newLngLat.lat, newLngLat.lng);
                    }
                });
            }
            
            onChange(clickLat, clickLng);
        });

        setIsInitialLoad(false);

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [maptilerKey]);

    // Handle prop updates for map center when address might be typed (if implemented)
    // or when the popup re-opens with different lat/lng
    useEffect(() => {
        if (!isInitialLoad && map.current) {
            if (lat !== null && lng !== null) {
                // If there's an existing marker, move it, else create
                if (markerRef.current) {
                    // Only move it if it's actually completely different to avoid snapbacks during drag
                    const currentPos = markerRef.current.getLngLat();
                    if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
                        markerRef.current.setLngLat([lng, lat]);
                        map.current.flyTo({ center: [lng, lat], zoom: 15 });
                    }
                } else {
                    markerRef.current = new maplibregl.Marker({ color: "#e11d48", draggable: true })
                        .setLngLat([lng, lat])
                        .addTo(map.current);
                        
                    markerRef.current.on('dragend', () => {
                        if (markerRef.current) {
                            const newLngLat = markerRef.current.getLngLat();
                            onChange(newLngLat.lat, newLngLat.lng);
                        }
                    });
                    map.current.flyTo({ center: [lng, lat], zoom: 15 });
                }
            } else {
                // If lat/lng becomes null (form reset), remove marker
                if (markerRef.current) {
                    markerRef.current.remove();
                    markerRef.current = null;
                }
                map.current.flyTo({ center: [defaultLng, defaultLat], zoom: 11 });
            }
        }
    }, [lat, lng, isInitialLoad]);

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <div className="flex justify-between items-center text-sm text-muted-foreground mb-1">
                <div className="flex items-center gap-2">
                    <span>Chọn vị trí chính xác trên màn hình:</span>
                    {addressToSearch && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={handleSearchAddress}
                            disabled={isSearching}
                        >
                            {isSearching ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
                            Tìm và ghim từ địa chỉ
                        </Button>
                    )}
                </div>
                {(lat !== null && lng !== null) ? (
                    <span className="text-primary font-mono text-xs">Lat: {lat.toFixed(6)}, Lng: {lng.toFixed(6)}</span>
                ) : (
                    <span className="italic">Chưa có tọa độ (Click để chọn)</span>
                )}
            </div>
            <div ref={mapContainer} className="w-full h-[300px] rounded-md border shadow-sm z-0" />
            <p className="text-xs text-muted-foreground mt-1 italic">
                * Click vào vị trí bạn muốn hoặc kéo thả <span className="text-red-500 font-bold">Pin đỏ</span> để thay đổi tọa độ.
            </p>
        </div>
    );
};

export default LocationPickerMap;
