import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Quote, Download, Heart, Clock, Plus, Lock, LogOut, Trash2, Pencil, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { useAdmin } from "@/contexts/AdminContext";
import { queryClient } from "@/lib/queryClient";
import { useScrollRestore, saveScrollPosition } from "@/hooks/use-scroll-restore";
import type { Content } from "@shared/schema";

const categoryOptions = [
  { value: "review", label: "후기" },
  { value: "nameStory", label: "이름이야기" },
  { value: "announcement", label: "공지사항" },
  { value: "expert", label: "한국이름학교" },
];
import reviewsCharacterImage from "@assets/KakaoTalk_20251226_140721227_1766725962281.png";
import { useLocation, Link } from "wouter";

// 후기 타입 정의
interface Testimonial {
  name: string;
  service: string;
  content: string;
  rating: number;
  date: string;
}

// 로컬스토리지 키
const ADMIN_TOKEN_KEY = "kna_admin_token";

// CMS 후기 카드 컴포넌트 (수정 기능 포함) - 네이버 블로그 스타일 이미지 업로드
function CmsReviewCard({ review }: { review: Content }) {
  const { isAdmin, token } = useAdmin();
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    category: review.category,
    title: review.title,
    thumbnail: review.thumbnail || "",
    content: review.content,
    isVideo: review.isVideo,
    videoUrl: review.videoUrl || "",
  });
  
  // Naver Blog style: uploaded images gallery
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Unified image upload (multiple support, no markdown)
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const imageUrl = response.objectPath;
      setUploadedImages(prev => {
        const newImages = [...prev, imageUrl];
        if (newImages.length === 1 || !editForm.thumbnail) {
          setEditForm(form => ({ ...form, thumbnail: imageUrl }));
        }
        return newImages;
      });
      toast({ title: "이미지가 추가되었습니다." });
    },
    onError: () => {
      toast({ title: "이미지 업로드에 실패했습니다.", variant: "destructive" });
    },
  });
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          toast({ title: "이미지 파일만 업로드할 수 있습니다.", variant: "destructive" });
          continue;
        }
        await uploadFile(file);
      }
    }
    e.target.value = "";
  };
  
  const setAsThumbnail = (imageUrl: string) => {
    setEditForm(prev => ({ ...prev, thumbnail: imageUrl }));
    toast({ title: "대표 이미지가 변경되었습니다." });
  };
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/contents/${review.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents", "review"] });
      toast({ title: "삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const response = await fetch(`/api/contents/${review.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...data,
          thumbnail: data.thumbnail?.trim() || null,
          videoUrl: data.videoUrl?.trim() || null,
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contents", "review"] });
      setShowEditDialog(false);
      toast({ title: "수정되었습니다." });
    },
    onError: () => {
      toast({ title: "수정 실패", variant: "destructive" });
    },
  });
  
  const handleDelete = () => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate();
    }
  };
  
  const handleEdit = () => {
    setEditForm({
      category: review.category,
      title: review.title,
      thumbnail: review.thumbnail || "",
      content: review.content,
      isVideo: review.isVideo,
      videoUrl: review.videoUrl || "",
    });
    // Extract existing images from content and thumbnail
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    const existingImages: string[] = [];
    let match;
    while ((match = imageRegex.exec(review.content)) !== null) {
      if (!existingImages.includes(match[1])) {
        existingImages.push(match[1]);
      }
    }
    if (review.thumbnail && !existingImages.includes(review.thumbnail)) {
      existingImages.unshift(review.thumbnail);
    }
    setUploadedImages(existingImages);
    setShowEditDialog(true);
  };
  
  const handleEditSubmit = () => {
    if (!editForm.title.trim() || !editForm.content.trim()) {
      toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    updateMutation.mutate(editForm);
  };

  return (
    <>
      <Link href={`/reviews/${review.id}`} className="block" onClick={() => saveScrollPosition("/reviews")}>
        <Card
          className="p-6 bg-card border border-border relative hover-elevate cursor-pointer"
          data-testid={`cms-review-card-${review.id}`}
        >
          {/* 관리자 버튼들 */}
          {isAdmin && (
            <div className="absolute top-2 right-2 flex gap-1 z-10" onClick={(e) => e.preventDefault()}>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(); }}
                className="text-blue-500"
                data-testid={`button-edit-cms-review-${review.id}`}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
                className="text-red-500"
                data-testid={`button-delete-cms-review-${review.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          {/* 썸네일 - 정사각형 (네이버 블로그 스타일) */}
          {review.thumbnail && (
            <div className="aspect-square w-full overflow-hidden rounded-lg mb-4">
              <img
                src={review.thumbnail}
                alt={review.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          {/* 제목 */}
          <h4 className="text-lg font-bold text-foreground mb-2">
            {review.title}
          </h4>
          
          {/* 날짜 */}
          <p className="text-xs text-muted-foreground">
            {new Date(review.createdAt).toLocaleDateString("ko-KR")}
          </p>
        </Card>
      </Link>
      
      {/* 수정 다이얼로그 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[210]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              후기 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-category">카테고리</Label>
              <Select 
                value={editForm.category} 
                onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger data-testid="select-edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[300]">
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-title">제목</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="제목을 입력하세요"
                data-testid="input-edit-title"
              />
            </div>
            {/* 이미지 업로드 (네이버 블로그 스타일) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>이미지</Label>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="h-8"
                  >
                    {isUploading ? "업로드 중..." : (
                      <>
                        <Upload className="w-4 h-4 mr-1" />
                        이미지 추가
                      </>
                    )}
                  </Button>
                </div>
              </div>
              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {uploadedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 ${editForm.thumbnail === img ? 'border-primary' : 'border-transparent'}`}
                      onClick={() => setAsThumbnail(img)}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      {editForm.thumbnail === img && (
                        <div className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground text-[10px] px-1 rounded">
                          대표
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newImages = uploadedImages.filter((_, i) => i !== idx);
                          setUploadedImages(newImages);
                          if (editForm.thumbnail === img) {
                            setEditForm(prev => ({ ...prev, thumbnail: newImages[0] || "" }));
                          }
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                클릭하여 대표 이미지 선택
              </p>
            </div>
            <div>
              <Label htmlFor="edit-content">내용</Label>
              <Textarea
                id="edit-content"
                value={editForm.content}
                onChange={(e) => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="내용을 입력하세요"
                rows={6}
                data-testid="input-edit-content"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-isVideo"
                checked={editForm.isVideo}
                onChange={(e) => setEditForm(prev => ({ ...prev, isVideo: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="edit-isVideo" className="cursor-pointer">동영상 콘텐츠</Label>
            </div>
            {editForm.isVideo && (
              <div>
                <Label htmlFor="edit-videoUrl">YouTube URL</Label>
                <Input
                  id="edit-videoUrl"
                  value={editForm.videoUrl}
                  onChange={(e) => setEditForm(prev => ({ ...prev, videoUrl: e.target.value }))}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowEditDialog(false)}
                variant="outline"
                className="flex-1"
              >
                취소
              </Button>
              <Button 
                onClick={handleEditSubmit}
                disabled={updateMutation.isPending}
                className="flex-1"
              >
                {updateMutation.isPending ? "저장 중..." : "저장하기"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Reviews() {
  const statsRef = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(false);
  const { toast } = useToast();
  const { isAdmin, token } = useAdmin();

  // 스크롤 위치 복원
  useScrollRestore("/reviews");
  
  // 후기 작성 상태 (레거시 - 로컬 저장용)
  const [showWriteDialog, setShowWriteDialog] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    name: "",
    service: "이름분석" as "이름분석" | "개명",
    content: "",
    date: new Date().toISOString().slice(0, 7).replace("-", "."),
  });
  
  // 추가된 후기 (세션 동안만 유지, 새로고침하면 사라짐)
  const [addedAnalysisReviews, setAddedAnalysisReviews] = useState<Testimonial[]>([]);
  const [addedNameChangeReviews, setAddedNameChangeReviews] = useState<Testimonial[]>([]);
  
  // CMS 후기 가져오기
  const { data: cmsReviews, isLoading: isLoadingReviews } = useQuery<Content[]>({
    queryKey: ["/api/contents", "review"],
    queryFn: async () => {
      const response = await fetch("/api/contents?category=review");
      if (!response.ok) throw new Error("Failed to fetch reviews");
      return response.json();
    },
  });
  
  // 후기 작성 처리 (레거시)
  const handleWriteReview = () => {
    if (!reviewForm.name.trim() || !reviewForm.content.trim()) {
      toast({ title: "이름과 내용을 입력해주세요.", variant: "destructive" });
      return;
    }
    
    const newReview = {
      name: reviewForm.name,
      service: reviewForm.service,
      content: reviewForm.content,
      rating: 5,
      date: reviewForm.date,
    };
    
    if (reviewForm.service === "이름분석") {
      setAddedAnalysisReviews(prev => [newReview, ...prev]);
    } else {
      setAddedNameChangeReviews(prev => [newReview, ...prev]);
    }
    
    setShowWriteDialog(false);
    setReviewForm({
      name: "",
      service: "이름분석",
      content: "",
      date: new Date().toISOString().slice(0, 7).replace("-", "."),
    });
    toast({ title: "후기가 추가되었습니다." });
  };
  
  // 하드코딩된 후기 데이터 (함수 밖으로 이동)

  useEffect(() => {
    // User Agent로 인앱 브라우저 감지
    const userAgent = navigator.userAgent || '';
    const isInstagram = userAgent.includes('Instagram');
    const isTikTok = userAgent.includes('TikTok') || userAgent.includes('musical_ly');
    
    if (isInstagram || isTikTok) {
      const className = isInstagram ? "ua-instagram" : "ua-tiktok";
      document.documentElement.classList.add(className);
      
      const styleId = `inapp-style-${className}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          html.${className} {
            font-size: 14px !important;
          }
          html.${className} h1 {
            font-size: clamp(18px, 4.5vw, 22px) !important;
          }
          html.${className} h2 {
            font-size: clamp(16px, 4vw, 20px) !important;
          }
          html.${className} h3, html.${className} h4 {
            font-size: clamp(15px, 3.8vw, 18px) !important;
          }
          html.${className} p, html.${className} li, html.${className} span {
            font-size: 14px !important;
          }
          html.${className} .text-sm {
            font-size: 13px !important;
          }
          html.${className} .text-base {
            font-size: 14px !important;
          }
          html.${className} .text-lg {
            font-size: 14px !important;
          }
          html.${className} .text-xl {
            font-size: 15px !important;
          }
          html.${className} .text-2xl {
            font-size: 16px !important;
          }
          html.${className} .text-3xl {
            font-size: 18px !important;
          }
          html.${className} .text-4xl {
            font-size: 20px !important;
          }
        `;
        document.head.appendChild(style);
      }
      
      console.log(`[Reviews] 인앱 브라우저 감지: ${className}, User Agent: ${userAgent}`);
      
      return () => {
        document.documentElement.classList.remove(className);
        const styleElement = document.getElementById(styleId);
        if (styleElement) {
          styleElement.remove();
        }
      };
    }
  }, []);

  // 애니메이션 효과
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !animated) {
            setAnimated(true);
            const numElements = entry.target.querySelectorAll('[data-animate-number]');
            numElements.forEach((el) => {
              const target = parseFloat(el.getAttribute('data-target') || '0');
              const suffix = el.getAttribute('data-suffix') || '';
              animateNumber(el as HTMLElement, target, suffix);
            });
          }
        });
      },
      { threshold: 0.35 }
    );

    if (statsRef.current) {
      observer.observe(statsRef.current);
    }

    return () => observer.disconnect();
  }, [animated]);

  const animateNumber = (element: HTMLElement, end: number, suffix: string) => {
    const duration = 1600;
    const start = 0;
    const startTime = performance.now();

    const easeOutQuad = (t: number) => t * (2 - t);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuad(progress);
      const current = Math.floor(start + (end - start) * eased);

      if (suffix === '%') {
        element.textContent = current + '%';
      } else if (suffix === '년') {
        element.textContent = current + '년';
      } else if (suffix === '+') {
        element.textContent = current.toLocaleString() + '+';
      } else {
        element.textContent = current.toLocaleString() + suffix;
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  };
  
  const analysisTestimonials = [
    {
      name: "김○○",
      service: "이름분석",
      content: "이제야 내 삶의 퍼즐이 맞춰지는 것같습니다. 감탄에 감탄",
      rating: 5,
      date: "2025.08",
    },
    {
      name: "이○○",
      service: "이름분석",
      content: "선생님과의 이름분석 상담은 너무나 달랐습니다",
      rating: 5,
      date: "2024.11",
    },
    {
      name: "안○○",
      service: "이름분석",
      content: "내용이 정말 소름끼치게 가깝더라구요",
      rating: 5,
      date: "2023.07",
    },
    {
      name: "박○○",
      service: "이름분석",
      content: "이름을 바꿀 수 있다는 게 얼마나 다행인지",
      rating: 5,
      date: "2024.03",
    },
    {
      name: "홍○○",
      service: "이름분석",
      content: "해결책이 생겨 마음이 편해졌어요",
      rating: 5,
      date: "2022.09",
    },
    {
      name: "최○○",
      service: "이름분석",
      content: "제 인생의 많은 부분을 다시 돌아보며 이해할 수 있는 시간이었습니다",
      rating: 5,
      date: "2023.12",
    },
    {
      name: "권○○",
      service: "이름분석",
      content: "한 시간이 너무 후딱 지나가더라구요. 뭔지 모를 후련함도 생기고. 누군가에게 말못한 고민까지 털어놓게 됐어요",
      rating: 5,
      date: "2021.05",
    },
    {
      name: "이○○",
      service: "이름분석",
      content: "아주 그냥 저희 집에 같이 살고 있는 줄요",
      rating: 5,
      date: "2025.02",
    },
    {
      name: "김○○",
      service: "이름분석",
      content: "이름대로 살고 있는 게 너무 너무 신기해요",
      rating: 5,
      date: "2022.06",
    },
    {
      name: "김○○",
      service: "이름분석",
      content: "지난날이 주마등처럼 지나가면서 저를 토닥여주고 싶었어요",
      rating: 5,
      date: "2024.08",
    },
    {
      name: "양○○",
      service: "이름분석",
      content: "성격 성향이 바뀐 게 이름의 끌어당김이었어요",
      rating: 5,
      date: "2023.03",
    },
  ];

  const testimonials = [
    {
      name: "박○○",
      service: "개명",
      content: "절 좋아하는 사람이 많아졌어요. 예민한 게 사라졌어요. 요즘 돈도 많이 벌어요",
      rating: 5,
      date: "2025.09",
    },
    {
      name: "최○○",
      service: "개명",
      content: "직장과 아파트가 생겼어요. 가전제품도 누가 사주셨어요. 아빠 외도 중이셨는데 정리하고 들어오셨어요. 지금은 소아정신과에서 아이들 진료보고 있는데 마더테레사라고 칭찬받고 인정받아요",
      rating: 5,
      date: "2024.05",
    },
    {
      name: "남○○",
      service: "개명",
      content: "미용실도 이전해서 넘 잘 되고 사랑하는 사람도 생겨 결혼해요",
      rating: 5,
      date: "2023.10",
    },
    {
      name: "김○○",
      service: "개명",
      content: "정부지원사업 3천만원 지원받아 플랫폼 사업 시작해서 넘 잘 돼요",
      rating: 5,
      date: "2022.12",
    },
    {
      name: "류○○",
      service: "개명",
      content: "개명 후 6년 세상에서 가장 행복한 사람",
      rating: 5,
      date: "2021.08",
    },
    {
      name: "이○○",
      service: "개명",
      content: "이상형의 남친이 생겼어요",
      rating: 5,
      date: "2024.01",
    },
    {
      name: "김○○",
      service: "개명",
      content: "가는 곳마다 열광. 이젠 대기업 임원만큼 돈을 벌어요. 크게 되고 빛날 것같아요",
      rating: 5,
      date: "2025.04",
    },
    {
      name: "박○○",
      service: "개명",
      content: "우울증과 알콜의존증으로 약까지 먹고 있었는데 거짓말처럼 술이 안땡겨요. 마음이 편해지고 삶이 의욕적으로 바뀌었어요",
      rating: 5,
      date: "2023.06",
    },
    {
      name: "김○○",
      service: "개명",
      content: "부지런해지고 원하던 회사에 합격했어요",
      rating: 5,
      date: "2022.03",
    },
    {
      name: "최○○",
      service: "개명",
      content: "남편이 달라졌어요. 밉지도 않고. 시어머님에 대한 원망이 사라졌어요. 아이가 알아서 스스로 잘 해요",
      rating: 5,
      date: "2021.11",
    },
  ];

  const stats = [
    { value: "30,000+", label: "누적 상담 건수", icon: Download },
    { value: "98%", label: "고객 만족도", icon: Heart },
    { value: "18년", label: "45만명 임상", icon: Clock, multiline: true }
  ];

  // 합쳐진 후기 목록 (추가된 것 + 기존 것)
  const allAnalysisTestimonials = [...addedAnalysisReviews, ...analysisTestimonials];
  const allNameChangeTestimonials = [...addedNameChangeReviews, ...testimonials];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section with character on left */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f766e] to-[#4fd1c5] dark:from-[#0a5850] dark:to-[#3ba89e] py-16 md:py-24">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTR2NGg0di00em0wLThoLTR2NGg0di00em04IDhoLTR2NGg4di00em0tOCA4aC00djRoNHYtNHptOCAwac00djRoNHYtNHptMC04aC00djRoNHYtNHptOC04aC00djRoNHYtNHptMCA4aC00djRoNHYtNHptLTggMGgtNHY0aDR2LTR6bTggOGgtNHY0aDR2LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
            <img 
              src={reviewsCharacterImage}
              alt="후기 캐릭터"
              className="w-auto h-40 md:h-56 flex-shrink-0"
            />
            <div className="text-center md:text-left">
              <p className="text-sm font-medium tracking-wide text-white/70 mb-2">CLIENT VOICES</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6" data-testid="text-reviews-title">
                고객 후기
              </h1>
              <p className="text-lg md:text-2xl text-white/90">
                이름대로 사는 것을 확인한 분들,<br />
                새로운 이름으로<br />
                꽃길을 걸으시는 분들의<br />
                생생한 이야기
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div ref={statsRef} className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
            {stats.map((stat, index) => {
              const IconComponent = stat.icon;
              const numValue = stat.multiline ? 18 : (stat.value.includes('%') ? 98 : 30000);
              const suffix = stat.value.includes('%') ? '%' : (stat.multiline ? '년' : '+');
              
              return (
                <div 
                  key={index} 
                  className={`flex flex-col items-center justify-center text-center py-6 ${index === 0 ? 'col-span-2 sm:col-span-1' : 'col-span-1'}`}
                  data-testid={`stat-${index}`}
                >
                  <div 
                    className="text-[36px] leading-[1.4] sm:text-5xl md:text-[60px] font-extrabold md:leading-relaxed mb-3 sm:mb-4 bg-gradient-to-r from-[#007C73] to-[#00B8A9] bg-clip-text text-transparent w-full px-2"
                    style={{ WebkitTextStroke: '0px' }}
                    data-animate-number
                    data-target={numValue}
                    data-suffix={suffix}
                  >
                    {stat.multiline ? '0년' : (suffix === '%' ? '0%' : '0+')}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[13px] sm:text-[18px] md:text-[24px] font-semibold text-muted-foreground">
                    <IconComponent className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px] md:w-[28px] md:h-[28px] opacity-65" strokeWidth={2} />
                    <span>{stat.label}</span>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </section>

      {/* 이름분석 상담후기 섹션 */}
      <section id="analysis-testimonials" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl review-section-title">
              이름분석 상담후기
            </h2>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
            {allAnalysisTestimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="p-6 hover-elevate relative"
                data-testid={`analysis-testimonial-card-${index}`}
              >
                {/* Quote Icon */}
                <Quote className="absolute top-6 right-6 w-12 h-12 text-muted-foreground/20" />
                
                {/* Name */}
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {testimonial.name}
                </h3>
                
                {/* Service Type */}
                <p className="text-sm text-muted-foreground mb-4">
                  {testimonial.service}
                </p>
                
                {/* Rating Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                
                {/* Content */}
                <p className="text-lg leading-relaxed text-foreground mb-6">
                  "{testimonial.content}"
                </p>
                
                {/* Date */}
                <p className="text-sm text-muted-foreground">
                  {testimonial.date}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 개명 후기 섹션 */}
      <section id="name-change-testimonials" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center space-y-4 mb-12">
            <h2 className="mt-4 bg-gradient-to-r from-[#0f766e] to-[#4fd1c5] dark:from-[#58C4C4] dark:to-[#6DD4D4] bg-clip-text text-2xl font-extrabold leading-tight text-transparent sm:text-3xl md:text-4xl review-section-title">
              개명 후기
            </h2>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
            {allNameChangeTestimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="p-6 hover-elevate relative"
                data-testid={`testimonial-card-${index}`}
              >
                {/* Quote Icon */}
                <Quote className="absolute top-6 right-6 w-12 h-12 text-muted-foreground/20" />
                
                {/* Name */}
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {testimonial.name}
                </h3>
                
                {/* Service Type */}
                <p className="text-sm text-muted-foreground mb-4">
                  {testimonial.service}
                </p>
                
                {/* Rating Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                
                {/* Content */}
                <p className="text-lg leading-relaxed text-foreground mb-6">
                  "{testimonial.content}"
                </p>
                
                {/* Date */}
                <p className="text-sm text-muted-foreground">
                  {testimonial.date}
                </p>
              </Card>
            ))}
          </div>

          {/* CMS 후기 섹션 */}
          {cmsReviews && cmsReviews.length > 0 && (
            <div className="mt-16">
              <h3 className="text-2xl font-bold text-center text-foreground mb-8">
                최신 고객 후기
              </h3>
              <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
                {cmsReviews.map((review) => (
                  <CmsReviewCard key={review.id} review={review} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-12 text-center">
            <a
              href="https://m.blog.naver.com/whats_ur_name_777?categoryNo=11&tab=1#contentslist_block"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-semibold text-sm bg-[#56D5DB] text-white shadow-sm transition-all duration-200 hover:bg-[#4ac5cb] hover:shadow-md active:scale-[0.98]"
              data-testid="link-detailed-testimonials"
            >
              <span>고객 후기 전체보기</span>
              <span className="text-lg">›</span>
            </a>
          </div>
        </div>
      </section>

      <Footer />
      
      {/* 후기 작성 다이얼로그 (레거시) */}
      <Dialog open={showWriteDialog} onOpenChange={setShowWriteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              후기 작성
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="review-name">고객명 (예: 김○○)</Label>
              <Input
                id="review-name"
                value={reviewForm.name}
                onChange={(e) => setReviewForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="김○○"
                data-testid="input-review-name"
              />
            </div>
            <div>
              <Label htmlFor="review-service">서비스 종류</Label>
              <Select 
                value={reviewForm.service} 
                onValueChange={(value: "이름분석" | "개명") => setReviewForm(prev => ({ ...prev, service: value }))}
              >
                <SelectTrigger data-testid="select-review-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="이름분석">이름분석</SelectItem>
                  <SelectItem value="개명">개명</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="review-date">날짜 (예: 2025.01)</Label>
              <Input
                id="review-date"
                value={reviewForm.date}
                onChange={(e) => setReviewForm(prev => ({ ...prev, date: e.target.value }))}
                placeholder="2025.01"
                data-testid="input-review-date"
              />
            </div>
            <div>
              <Label htmlFor="review-content">후기 내용</Label>
              <Textarea
                id="review-content"
                value={reviewForm.content}
                onChange={(e) => setReviewForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="후기 내용을 입력하세요"
                rows={4}
                data-testid="input-review-content"
              />
            </div>
            <Button 
              onClick={handleWriteReview}
              className="w-full"
              data-testid="button-submit-review"
            >
              등록하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 관리자 플로팅 버튼 - 레거시 로컬 후기 작성용 */}
      {isAdmin && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
          <Button
            onClick={() => setShowWriteDialog(true)}
            className="rounded-full shadow-lg bg-gradient-to-r from-[#007C73] to-[#00B8A9] hover:opacity-90"
            size="lg"
            data-testid="button-write-review"
          >
            <Plus className="w-5 h-5 mr-2" />
            후기 작성
          </Button>
        </div>
      )}
    </div>
  );
}
