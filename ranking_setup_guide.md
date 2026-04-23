# Google Sheets API 연동 가이드

이 가이드는 게임의 랭킹 시스템을 구현하기 위해 Google Sheets와 Google Apps Script를 설정하는 방법을 설명합니다.

## 1. Google Spreadsheet 준비
1. [Google Sheets](https://sheets.new)에서 새 스프레드시트를 만듭니다.
2. 첫 번째 시트의 이름을 `ranking`으로 변경합니다.
3. 첫 번째 행(Header)에 다음 항목을 입력합니다:
   - A1: `Timestamp`
   - B1: `Name`
   - C1: `Time` (형식: MM:SS)

## 2. Google Apps Script 작성
1. 스프레드시트 메뉴에서 **확장 프로그램 > Apps Script**를 클릭합니다.
2. 기존 코드를 지우고 아래 코드를 복사하여 붙여넣습니다.

```javascript
function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ranking');
  const action = e.parameter.action;

  if (action === 'getRanking') {
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1); // 헤더 제외

    // 시간 순으로 정렬 (MM:SS 형식 문자열 비교)
    rows.sort((a, b) => {
      return a[2].localeCompare(b[2]);
    });

    const ranking = rows.slice(0, 5).map(row => ({
      name: row[1],
      time: row[2]
    }));

    return ContentService.createTextOutput(JSON.stringify(ranking))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ranking');
  const params = JSON.parse(e.postData.contents);
  
  if (params.action === 'saveScore') {
    sheet.appendRow([new Date(), params.name, params.time]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

## 3. 웹 앱 배포
1. 오른쪽 상단의 **배포 > 새 배포**를 클릭합니다.
2. 유형 선택에서 **웹 앱**을 선택합니다.
3. 다음 설정을 확인합니다:
   - 설명: `Breakout Ranking API`
   - 다음 사용자로 실행: `나(Me)`
   - 액세스 권한이 있는 사용자: `모든 사용자(Anyone)` (중요!)
4. **배포**를 클릭하고 승인 절차를 거칩니다.
5. 생성된 **웹 앱 URL**을 복사합니다.

## 4. Next.js 프로젝트 설정
1. `app/api/ranking/route.ts` 파일을 엽니다.
2. `GOOGLE_SCRIPT_URL` 변수에 복사한 웹 앱 URL을 붙여넣습니다.
