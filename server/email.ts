import { Resend } from 'resend';
import type { Consultation, Inquiry } from '@shared/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

const RECIPIENT_EMAIL = 'iimooii1000@gmail.com';
const FROM_EMAIL = 'onboarding@resend.dev'; // Resend의 테스트 발신자

const SITE_URL = 'https://korea-name-acad.com';

const PAGE_NAMES: Record<string, string> = {
  'alone-fate':     '혼자살 팔자',
  'husband-luck':   '남편복',
  'short-life':     '단명수',
  'children-luck':  '자식복',
  'name-rank':      '전국 이름 순위',
};

// ── KNOP: 문자→달력 상담일정 자동등록 알림 (개명여부/인원 확인 요청) ──
export async function sendCalendarCheckNotification(p: {
  name: string;
  date: string;
  time?: string;
  phone: string;
  hongik: boolean;
  summary?: string;
  calendarLink: string;
}): Promise<void> {
  try {
    const when = p.time ? `${p.date} ${p.time}` : p.date;
    await resend.emails.send({
      from: FROM_EMAIL,
      to: RECIPIENT_EMAIL,
      subject: `[KNOP] 상담일정 등록 · ${p.name}님 (${p.date}) — 개명여부/인원 확인 필요`,
      html: `
        <div style="font-family:'Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#18a999;margin-bottom:4px;">📅 상담일정이 자동 등록되었습니다</h2>
          <p style="color:#888;margin-top:0;margin-bottom:20px;font-size:13px;">문자 분석 → 달력 등록 완료 · <b>개명여부와 상담인원</b>만 확인해 주세요.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <tr><td style="padding:8px 12px;background:#f4f4f4;font-weight:bold;width:96px;">의뢰인</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.name}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f4f4;font-weight:bold;">상담일시</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${when}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f4f4;font-weight:bold;">전화번호</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.phone}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f4f4;font-weight:bold;">홍익</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.hongik ? "✅ 체크됨" : "—"}</td></tr>
            ${p.summary ? `<tr><td style="padding:8px 12px;background:#f4f4f4;font-weight:bold;">요약</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${p.summary}</td></tr>` : ""}
          </table>
          <div style="background:#fff7e6;border-left:4px solid #f5a623;border-radius:4px;padding:12px 16px;margin-bottom:20px;font-size:14px;color:#7a5a10;">
            ⚠️ <b>개명여부</b>와 <b>상담인원</b>은 아직 비어 있습니다. 아래 버튼으로 해당 일정에서 채워주세요.
          </div>
          <a href="${p.calendarLink}" style="display:inline-block;background:#18a999;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;font-size:14px;">
            달력에서 ${p.date} 일정 확인 →
          </a>
        </div>
      `,
    });
    console.log(`✅ KNOP 상담일정 알림 이메일 전송: ${p.name} ${p.date}`);
  } catch (error) {
    console.error("❌ KNOP 상담일정 알림 이메일 실패:", error);
  }
}

export async function sendCommentNotification(comment: {
  id: string;
  pageId: string;
  nickname: string;
  content: string;
  totalStrokes: number | null;
  isPrivate: boolean;
}): Promise<void> {
  try {
    const pageName = PAGE_NAMES[comment.pageId] ?? comment.pageId;
    const pageUrl = `${SITE_URL}/experience-zone/${comment.pageId}#comment-${comment.id}`;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: RECIPIENT_EMAIL,
      subject: `[한국이름학교] 새 댓글 - ${pageName} (${comment.nickname})`,
      html: `
        <div style="font-family:'Malgun Gothic',sans-serif;max-width:500px;margin:0 auto;padding:24px;">
          <h2 style="color:#18a999;margin-bottom:4px;">💬 새 댓글이 달렸습니다</h2>
          <p style="color:#888;margin-top:0;margin-bottom:20px;font-size:14px;">체험존 · ${pageName}</p>
          <div style="background:#f8f9fa;border-left:4px solid #18a999;border-radius:4px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px 0;font-size:13px;color:#888;">
              <strong style="color:#333;">${comment.nickname}</strong>
              ${comment.totalStrokes ? ` &nbsp;·&nbsp; 총운 ${comment.totalStrokes}획` : ''}
              ${comment.isPrivate ? ' &nbsp;·&nbsp; 🔒 비공개' : ''}
            </p>
            <p style="margin:0;font-size:15px;color:#222;line-height:1.6;">${comment.content}</p>
          </div>
          <a href="${pageUrl}"
            style="display:inline-block;background:#18a999;color:white;text-decoration:none;
                   padding:12px 24px;border-radius:8px;font-weight:bold;font-size:14px;">
            댓글 바로가기 →
          </a>
        </div>
      `,
    });
    console.log(`✅ 댓글 알림 이메일 전송 완료: ${comment.id}`);
  } catch (error) {
    console.error('❌ 댓글 알림 이메일 전송 실패:', error);
  }
}

export async function sendConsultationNotification(consultation: Consultation): Promise<void> {
  try {
    const typeLabel = consultation.type === 'analysis' ? '이름분석' : '이름감명';
    
    // 이메일 제목
    const subject = `🔔 새로운 ${typeLabel} 상담 신청 - ${consultation.peopleData[0]?.name || '고객'}님`;

    // HTML 이메일 본문
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Malgun Gothic', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #58C4C4 0%, #45B8B8 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0; }
          .section { margin-bottom: 20px; }
          .label { font-weight: bold; color: #58C4C4; margin-bottom: 5px; }
          .value { padding: 10px; background: white; border-left: 3px solid #58C4C4; margin-bottom: 10px; }
          .person-card { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #e0e0e0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">💫 새로운 상담 신청이 접수되었습니다</h2>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">와츠유어네임 이름연구협회</p>
          </div>
          
          <div class="content">
            <div class="section">
              <div class="label">📋 상담 유형</div>
              <div class="value">${typeLabel}</div>
            </div>

            <div class="section">
              <div class="label">👤 신청 인원</div>
              <div class="value">${consultation.numPeople}명</div>
            </div>

            <div class="section">
              <div class="label">👥 신청자 정보</div>
              ${consultation.peopleData.map((person, index) => `
                <div class="person-card">
                  <strong>${index + 1}. ${person.name}</strong><br>
                  성별: ${person.gender}<br>
                  출생년도: ${person.birthYear}<br>
                  직업: ${person.occupation}
                </div>
              `).join('')}
            </div>

            <div class="section">
              <div class="label">📞 연락처</div>
              <div class="value">${consultation.phone}</div>
            </div>

            ${consultation.hasNameChange === 'yes' ? `
              <div class="section">
                <div class="label">🔄 개명 정보</div>
                <div class="value">
                  개명 횟수: ${consultation.numNameChanges}회<br>
                  ${consultation.nameChangeData?.map((change, index) => `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                      <strong>${index + 1}번째 개명:</strong><br>
                      현재 이름: ${change.previousName}<br>
                      한글 이름: ${change.koreanName}<br>
                      한자 이름: ${change.chineseName}<br>
                      개명 년도: ${change.changeYear}
                    </div>
                  `).join('') || ''}
                </div>
              </div>
            ` : ''}

            ${consultation.type === 'naming' && consultation.evaluationKoreanName ? `
              <div class="section">
                <div class="label">📝 감명 대상 이름</div>
                <div class="value">
                  한글: ${consultation.evaluationKoreanName}<br>
                  한자: ${consultation.evaluationChineseName || '-'}
                </div>
              </div>
            ` : ''}

            <div class="section">
              <div class="label">💬 상담 이유</div>
              <div class="value" style="white-space: pre-wrap;">${consultation.reason}</div>
            </div>

            ${consultation.referralSource ? `
              <div class="section">
                <div class="label">🔍 문의 경로</div>
                <div class="value">${consultation.referralSource}${consultation.referrerName ? ` (소개자: ${consultation.referrerName})` : ''}</div>
              </div>
            ` : ''}

            <div class="section">
              <div class="label">💰 입금자명</div>
              <div class="value">${consultation.depositorName}</div>
            </div>

            <div class="section">
              <div class="label">⏰ 희망 상담 시간</div>
              <div class="value">${consultation.consultationTime}</div>
            </div>

            ${consultation.fileName ? `
              <div class="section">
                <div class="label">📎 첨부 파일</div>
                <div class="value">
                  ${consultation.fileName}
                  <br>
                  <small style="color: #666;">※ 첨부파일이 이메일에 포함되어 있습니다.</small>
                </div>
              </div>
            ` : ''}

            <div class="section">
              <div class="label">🕐 신청 시간</div>
              <div class="value">${new Date(consultation.createdAt).toLocaleString('ko-KR', { 
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</div>
            </div>
          </div>

          <div class="footer">
            <p>이 메일은 자동으로 발송되었습니다.<br>
            관리자 페이지에서 상세 내용을 확인하실 수 있습니다.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // 텍스트 버전 (HTML을 지원하지 않는 이메일 클라이언트용)
    const textContent = `
🔔 새로운 ${typeLabel} 상담 신청

📋 상담 유형: ${typeLabel}
👤 신청 인원: ${consultation.numPeople}명

👥 신청자 정보:
${consultation.peopleData.map((person, index) => `
${index + 1}. ${person.name}
   - 성별: ${person.gender}
   - 출생년도: ${person.birthYear}
   - 직업: ${person.occupation}
`).join('\n')}

📞 연락처: ${consultation.phone}

${consultation.hasNameChange === 'yes' ? `
🔄 개명 정보:
개명 횟수: ${consultation.numNameChanges}회
${consultation.nameChangeData?.map((change, index) => `
${index + 1}번째 개명:
- 현재 이름: ${change.previousName}
- 한글 이름: ${change.koreanName}
- 한자 이름: ${change.chineseName}
- 개명 년도: ${change.changeYear}
`).join('\n') || ''}
` : ''}

${consultation.type === 'naming' && consultation.evaluationKoreanName ? `
📝 감명 대상 이름:
한글: ${consultation.evaluationKoreanName}
한자: ${consultation.evaluationChineseName || '-'}
` : ''}

💬 상담 이유:
${consultation.reason}

${consultation.referralSource ? `🔍 문의 경로: ${consultation.referralSource}${consultation.referrerName ? ` (소개자: ${consultation.referrerName})` : ''}\n` : ''}
💰 입금자명: ${consultation.depositorName}
⏰ 희망 상담 시간: ${consultation.consultationTime}

${consultation.fileName ? `📎 첨부 파일: ${consultation.fileName}\n※ 첨부파일이 이메일에 포함되어 있습니다.\n` : ''}

🕐 신청 시간: ${new Date(consultation.createdAt).toLocaleString('ko-KR', { 
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})}

---
이 메일은 자동으로 발송되었습니다.
관리자 페이지에서 상세 내용을 확인하실 수 있습니다.
    `.trim();

    // 첨부파일 준비 (있는 경우)
    const attachments = consultation.fileName && consultation.fileData ? [{
      filename: consultation.fileName,
      content: consultation.fileData, // base64 인코딩된 데이터
    }] : undefined;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: RECIPIENT_EMAIL,
      subject: subject,
      html: htmlContent,
      text: textContent,
      attachments: attachments,
    });

    console.log(`✅ 상담 신청 이메일 전송 완료: ${consultation.id}`);
  } catch (error) {
    console.error('❌ 이메일 전송 실패:', error);
  }
}

// ── 새 문의 접수 → 관리자 알림 ──────────────────────────────
export async function sendInquiryNotification(inquiry: Inquiry): Promise<void> {
  try {
    const typeLabel = inquiry.contactType === 'sms' ? '📱 문자 알림' : '📧 이메일 알림';
    await resend.emails.send({
      from: FROM_EMAIL,
      to: RECIPIENT_EMAIL,
      subject: `[한국이름학교] 새 문의 - ${inquiry.name}`,
      html: `
        <div style="font-family:'Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#18a999;margin-bottom:4px;">📨 새 문의가 접수되었습니다</h2>
          <p style="color:#888;margin-top:0;margin-bottom:20px;font-size:13px;">
            ${new Date(inquiry.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <tr>
              <td style="padding:8px 12px;background:#f4f4f4;font-weight:bold;width:100px;">성함</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inquiry.name}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f4f4;font-weight:bold;">연락처</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${inquiry.contact} &nbsp;<span style="color:#888;font-size:12px;">${typeLabel}</span></td>
            </tr>
          </table>
          <div style="background:#f8f9fa;border-left:4px solid #18a999;border-radius:4px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#888;margin-bottom:6px;">문의 내용</p>
            <p style="margin:0;font-size:15px;color:#222;white-space:pre-wrap;line-height:1.7;">${inquiry.content}</p>
          </div>
          <a href="${SITE_URL}/admin"
            style="display:inline-block;background:#18a999;color:white;text-decoration:none;
                   padding:12px 24px;border-radius:8px;font-weight:bold;font-size:14px;">
            관리자 페이지에서 답변하기 →
          </a>
        </div>
      `,
    });
    console.log(`✅ 문의 알림 이메일 전송 완료: ${inquiry.id}`);
  } catch (error) {
    console.error('❌ 문의 알림 이메일 전송 실패:', error);
  }
}

// ── 관리자 답변 → 사용자에게 이메일 발송 ─────────────────────
export async function sendInquiryReplyToUser(inquiry: Inquiry): Promise<void> {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: inquiry.contact,
      subject: '[한국이름학교] 문의하신 내용에 답변드렸습니다',
      html: `
        <div style="font-family:'Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#18a999;margin-bottom:4px;">안녕하세요, ${inquiry.name}님</h2>
          <p style="color:#555;font-size:14px;margin-bottom:20px;">문의해 주셔서 감사합니다. 아래와 같이 답변드립니다.</p>
          <div style="background:#f0fafa;border:1px solid #c4eeeb;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 6px 0;font-size:12px;color:#18a999;font-weight:bold;">이름의신 답변</p>
            <p style="margin:0;font-size:15px;color:#222;white-space:pre-wrap;line-height:1.7;">${inquiry.adminReply ?? ''}</p>
          </div>
          <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="margin:0 0 4px 0;font-size:12px;color:#888;">원래 문의 내용</p>
            <p style="margin:0;font-size:13px;color:#555;white-space:pre-wrap;">${inquiry.content}</p>
          </div>
          <p style="font-size:13px;color:#888;">추가 문의가 있으시면 언제든지 다시 문의해 주세요.</p>
          <p style="font-size:13px;color:#18a999;font-weight:bold;">한국이름학교 드림</p>
        </div>
      `,
    });
    console.log(`✅ 문의 답변 이메일 발송 완료: ${inquiry.id} → ${inquiry.contact}`);
  } catch (error) {
    console.error('❌ 문의 답변 이메일 발송 실패:', error);
  }
}
