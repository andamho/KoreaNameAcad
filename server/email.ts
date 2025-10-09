import { Resend } from 'resend';
import type { Consultation } from '@shared/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

const RECIPIENT_EMAIL = 'iimooii1000@gmail.com';
const FROM_EMAIL = 'onboarding@resend.dev'; // Resend의 테스트 발신자

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
                      현재 이름: ${change.currentName}<br>
                      이전 이름: ${change.previousName}<br>
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
                  <small style="color: #666;">※ 첨부파일은 관리자 페이지에서 확인하실 수 있습니다.</small>
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
- 현재 이름: ${change.currentName}
- 이전 이름: ${change.previousName}
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

💰 입금자명: ${consultation.depositorName}
⏰ 희망 상담 시간: ${consultation.consultationTime}

${consultation.fileName ? `📎 첨부 파일: ${consultation.fileName}\n※ 첨부파일은 관리자 페이지에서 확인하실 수 있습니다.\n` : ''}

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

    await resend.emails.send({
      from: FROM_EMAIL,
      to: RECIPIENT_EMAIL,
      subject: subject,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ 상담 신청 이메일 전송 완료: ${consultation.id}`);
  } catch (error) {
    console.error('❌ 이메일 전송 실패:', error);
    // 이메일 전송 실패해도 상담 신청은 저장되도록 에러를 던지지 않음
    // 대신 로그만 남김
  }
}
