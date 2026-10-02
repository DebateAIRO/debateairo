# DebateAI — Chính sách quyền riêng tư

<!-- legal-chrome
summaryTitle: Tóm tắt
eyebrow: CHÍNH SÁCH QUYỀN RIÊNG TƯ · v3.0 · CÓ HIỆU LỰC [DATE]
title: Dữ liệu chúng tôi lưu trữ và lý do
lede: Các quyền của bạn và nghĩa vụ của chúng tôi theo GDPR (EU) 2016/679, được trình bày bằng ngôn ngữ dễ hiểu. Mười bốn mục và Phụ lục B — cuộn đến cuối.
endMarker: HẾT CHÍNH SÁCH · GDPR (EU) 2016/679 · v3.0
bodyLabel: Nội dung Chính sách quyền riêng tư
annexTitle: Phụ lục B — Điều khoản quyền riêng tư theo khu vực
jumps:
01 BÊN KIỂM SOÁT
02 DỮ LIỆU CHÚNG TÔI THU THẬP
04 CƠ SỞ PHÁP LÝ
05 MÔ HÌNH VÀ CHUYỂN DỮ LIỆU
06 CÔNG KHAI
07 THỜI HẠN LƯU GIỮ
10 CÁC QUYỀN GDPR CỦA BẠN
13 COOKIE
-->

2026-09-21 · @Someone

**Bản dự thảo v3.0 để cố vấn pháp lý rà soát — thay thế bản v2.1 đã phát hành (`apps/ui/lib/privacyPolicy.ts`). Không phải tư vấn pháp lý.** Phiên bản này được soạn theo đúng cách mã nguồn thực tế vận hành và sửa năm nội dung trong v2.1 mâu thuẫn với mã nguồn: dữ liệu phiên, thời hạn lưu giữ, phân tích, xuất dữ liệu và điều xảy ra với các cuộc tranh luận đã công khai khi xóa. Dấu ngoặc vuông đánh dấu nội dung chỉ bạn mới có thể điền; \[pending\] đánh dấu một tính năng được chính sách mô tả nhưng chưa được xây dựng và phải tồn tại trước khi chính sách được công bố.

**Version 3.0 · Effective \[date\] · Các phiên bản trước tại dezbatere.ro/privacy/versions · Bên kiểm soát: DebateAIRO S.R.L., Bucharest**

**In short.** Chúng tôi thu thập những gì cần thiết để tài khoản hoạt động và những gì bạn lựa chọn nhập. Câu hỏi của bạn được gửi đến các nhà cung cấp AI nêu trong Sổ đăng ký của chúng tôi; chúng không được dùng để huấn luyện mô hình. Các cuộc tranh luận là riêng tư trừ khi bạn công khai chúng. Việc xóa tài khoản sẽ hủy các khóa bảo vệ dữ liệu của bạn và gỡ các cuộc tranh luận đã công khai. Bạn có thể liên hệ với chúng tôi tại privacy@dezbatere.ro, và người được nêu tên trong một cuộc tranh luận có thể yêu cầu gỡ bỏ mà không cần tài khoản.

## 1. Ai chịu trách nhiệm đối với dữ liệu của bạn

Bên kiểm soát dữ liệu cá nhân của bạn là **DebateAIRO S.R.L.**, \[address\], Bucharest, Romania, Đăng ký Thương mại \[J40/…\], CUI \[…\]. Hãy viết đến **privacy@dezbatere.ro** về bất kỳ vấn đề nào trong chính sách này; chúng tôi trả lời trong vòng một tháng. Chúng tôi không bổ nhiệm cán bộ bảo vệ dữ liệu vì pháp luật không yêu cầu; địa chỉ này được \[role\] giám sát. Khi chúng tôi đã bổ nhiệm đại diện hoặc cán bộ phụ trách quyền riêng tư cho một quốc gia cụ thể, Phụ lục B nêu danh tính của họ.

## 2. Dữ liệu chúng tôi thu thập và nguồn dữ liệu

Chúng tôi chỉ thu thập những gì cần thiết để tài khoản hoạt động, những gì bạn lựa chọn cung cấp và những gì pháp luật yêu cầu chúng tôi lưu giữ.

| Danh mục | Cụ thể là gì | Nguồn |
| --- | --- | --- |
| **Tài khoản** | Địa chỉ email và địa chỉ email khôi phục (được lưu trữ dưới dạng mã hóa, cùng một chỉ mục có khóa để chúng tôi có thể tìm tài khoản mà không đọc địa chỉ); mật khẩu (được lưu dưới dạng hàm băm, không bao giờ ở dạng rõ); bí mật xác thực hai yếu tố của bạn (được mã hóa); mười mã khôi phục (được lưu dưới dạng hàm băm); bí danh của bạn; thời điểm bạn xác nhận mình từ 18 tuổi trở lên | Bạn, khi đăng ký |
| **Phiên và bảo mật** | Mã thông báo phiên đã băm; hàm băm có khóa của chuỗi tác nhân người dùng trong trình duyệt của bạn, dùng để nhận biết khi một phiên chuyển sang trình duyệt khác; dấu thời gian tạo, lần sử dụng cuối và hết hạn. Chúng tôi **không** lưu địa chỉ IP, tên thiết bị hoặc thông tin chi tiết về trình duyệt của bạn cùng với phiên, và danh sách phiên bạn thấy trong phần Cài đặt chỉ hiển thị dấu thời gian | Trình duyệt của bạn |
| **Dấu vết kiểm toán bảo mật** | Nhật ký chỉ được phép ghi nối tiếp về các sự kiện liên quan đến bảo mật — đăng ký, xác minh, nỗ lực đăng nhập, khôi phục, công khai, xóa. Địa chỉ IP và tác nhân người dùng của mỗi sự kiện chỉ được lưu dưới dạng bản tóm lược có khóa một chiều (Argon2id), vì vậy không thể đọc ngược nhưng có thể đối chiếu trong một khoảng thời gian. Các tín hiệu rủi ro đăng nhập và khôi phục được lưu trữ dưới dạng mã hóa trong 90 ngày | Trình duyệt của bạn, tại thời điểm xảy ra từng sự kiện |
| **Nội dung tranh luận** | Câu hỏi bạn nhập; các chú thích định hướng bạn thiết lập; các luận điểm, phản biện, tham chiếu bằng chứng, điểm số và phán quyết do công cụ tạo ra; bản ghi nguyên văn nội dung từng nhà cung cấp AI trả về; truy vấn truy xuất và tham chiếu nguồn. Toàn bộ dữ liệu này được lưu trữ dưới dạng mã hóa bằng một khóa dành riêng cho tài khoản của bạn | Bạn và các mô hình AI xử lý câu hỏi của bạn |
| **Hỗ trợ** | Tin nhắn bạn trao đổi với trợ lý hỗ trợ hoặc một người, được lưu trữ dưới dạng mã hóa; ngôn ngữ được sử dụng; việc bạn có cho phép trợ lý xem trạng thái (không bao giờ là nội dung) của các cuộc tranh luận hay không; các đánh giá bạn đưa ra. Nếu một tin nhắn kích hoạt cơ chế kiểm soát lạm dụng, chúng tôi lưu hàm băm của tin nhắn và hàm băm của địa chỉ IP gửi tin nhắn đó | Bạn |
| **Hồ sơ chấp nhận và đồng ý** | Phiên bản và hàm băm nội dung của Điều khoản bạn đã chấp nhận và chính sách đã được hiển thị cho bạn; thời điểm; màn hình và cơ chế được sử dụng; ngôn ngữ của bạn; địa chỉ IP và tác nhân người dùng tại thời điểm đó; từng sự đồng ý bạn đã đưa ra hoặc rút lại và thời điểm tương ứng | Trình duyệt của bạn, khi đăng ký và mỗi khi bạn thay đổi một lựa chọn |
| **Thanh toán** \[pending — once a paid plan exists\] | Gói dịch vụ, giá, kỳ thanh toán, tham chiếu giao dịch, bằng chứng về địa điểm chịu thuế. Thông tin thẻ do nhà cung cấp dịch vụ thanh toán của chúng tôi nắm giữ, không bao giờ do chúng tôi nắm giữ | Bạn và nhà cung cấp dịch vụ thanh toán |
| **Những người không phải người dùng của chúng tôi** | Dữ liệu cá nhân về người khác mà bạn đưa vào câu hỏi hoặc công cụ tạo ra khi trả lời câu hỏi. Chúng tôi yêu cầu bạn không làm điều này; mục 11 giải thích cách chúng tôi xử lý khi việc đó vẫn xảy ra | Gián tiếp từ bạn |

Chúng tôi **không** thu thập dữ liệu phân tích hoặc dữ liệu đo từ xa về cách bạn sử dụng sản phẩm và không đặt cookie cho mục đích đó. Nếu điều này thay đổi, chính sách này và Chính sách Cookie sẽ được thay đổi trước, đồng thời bạn sẽ được hỏi ý kiến.

## 3. Thông tin nhạy cảm

Một công cụ tranh luận khuyến khích các câu hỏi về chính trị, tôn giáo, sức khỏe, tình dục và niềm tin. Đây là các loại dữ liệu đặc biệt theo Điều 9 GDPR và chúng có thể xuất hiện trong câu hỏi của bạn dù chúng tôi có chủ định thu thập hay không.

**Về bạn.** Khi đăng ký, bằng một câu riêng biệt, bạn đồng ý rõ ràng cho phép chúng tôi xử lý thông tin nhạy cảm mà bạn lựa chọn đưa vào câu hỏi của mình nhằm vận hành các cuộc tranh luận. Bạn có thể rút lại sự đồng ý bất cứ lúc nào bằng cách không đưa thông tin đó vào hoặc bằng cách xóa cuộc tranh luận. Nội dung bạn công khai về bản thân là dữ liệu mà bạn đã lựa chọn công khai.

**Về người khác.** Không có điều kiện pháp lý nào cho phép chúng tôi xử lý dữ liệu nhạy cảm về một bên thứ ba mà bạn nêu tên trong câu hỏi, và các nhà cung cấp AI của chúng tôi cũng không có điều kiện đó. Đây là lý do Điều khoản nghiêm cấm việc này, chúng tôi giảm thiểu dữ liệu gửi đi và nhanh chóng gỡ nội dung đó khi có yêu cầu — mục 11.

**Thông tin sức khỏe.** Một số quốc gia áp dụng luật cụ thể đối với dữ liệu liên quan đến sức khỏe, bao gồm cả các suy luận. Nếu bạn sống tại \[the State of Washington\], một \[Consumer Health Data Privacy Notice\] riêng sẽ được áp dụng.

## 4. Lý do chúng tôi sử dụng dữ liệu của bạn và cơ sở pháp lý

Mỗi mục đích có một cơ sở pháp lý theo Điều 6(1) GDPR và chúng tôi không tái sử dụng dữ liệu được thu thập cho một mục đích vào mục đích khác.

| Mục đích | Dữ liệu | Cơ sở |
| --- | --- | --- |
| Tạo và vận hành tài khoản của bạn, xác thực bạn, vận hành và lưu trữ các cuộc tranh luận để bạn có thể mở lại và phát lại | Tài khoản, phiên, nội dung tranh luận | **Hợp đồng** — Art. 6(1)(b) |
| Gửi câu hỏi của bạn và các phát biểu của công cụ đến các nhà cung cấp AI để tạo một cuộc tranh luận | Nội dung tranh luận | **Hợp đồng** — Art. 6(1)(b) |
| Giữ an toàn cho dịch vụ, phát hiện hành vi lạm dụng, giúp bạn nhận biết một lần đăng nhập không phải do mình thực hiện, duy trì dấu vết kiểm toán | Phiên, dấu vết kiểm toán bảo mật, hàm băm chống lạm dụng của hoạt động hỗ trợ | **Lợi ích hợp pháp** — Art. 6(1)(f): lợi ích của chúng tôi và của bạn đối với một dịch vụ an toàn. Bạn có thể phản đối; mục 10 |
| Chứng minh rằng bạn đã chấp nhận Điều khoản và đã đưa ra hoặc rút lại sự đồng ý | Hồ sơ chấp nhận và đồng ý | **Nghĩa vụ pháp lý** — Art. 6(1)(c), nghĩa vụ của chúng tôi trong việc chứng minh sự đồng ý theo Art. 7(1) — và lợi ích hợp pháp trong việc chứng minh hợp đồng |
| Trả lời yêu cầu hỗ trợ | Hỗ trợ | **Hợp đồng** — Art. 6(1)(b) |
| Xử lý thông tin nhạy cảm mà bạn đưa vào về bản thân | Nội dung tranh luận | **Sự đồng ý rõ ràng** — Art. 9(2)(a), được đưa ra riêng khi đăng ký |
| Công khai một cuộc tranh luận mà bạn lựa chọn công khai | Nội dung tranh luận, bí danh | **Hợp đồng** — Art. 6(1)(b), theo chỉ thị của bạn; đối với dữ liệu nhạy cảm về bạn, Art. 9(2)(e) — dữ liệu mà bạn đã công khai một cách rõ ràng |
| Gửi tin tức sản phẩm cho bạn | Địa chỉ email | **Sự đồng ý** — Art. 6(1)(a), một ô không được đánh dấu sẵn; có thể rút lại bất cứ lúc nào từ bất kỳ email nào hoặc trong phần Cài đặt |
| Tuân thủ nghĩa vụ thuế, kế toán và pháp lý \[pending paid plans\] | Thanh toán, hồ sơ chấp nhận | **Nghĩa vụ pháp lý** — Art. 6(1)(c) |
| Xử lý yêu cầu pháp lý, báo cáo về nội dung bất hợp pháp và các nghĩa vụ của chúng tôi với tư cách dịch vụ lưu trữ | Bất kỳ dữ liệu nào liên quan đến yêu cầu | **Nghĩa vụ pháp lý** — Art. 6(1)(c) — và lợi ích hợp pháp |

Chúng tôi không lập hồ sơ về bạn, không sử dụng dữ liệu của bạn cho quảng cáo và không bán dữ liệu đó. Chúng tôi không sử dụng nội dung của bạn để huấn luyện mô hình và không cho phép các nhà cung cấp của mình làm như vậy — mục 5.

## 5. Nhà cung cấp AI và chuyển dữ liệu quốc tế

**Dữ liệu được gửi.** Để vận hành một cuộc tranh luận, chúng tôi gửi văn bản đến một hoặc nhiều nhà cung cấp AI bên ngoài: câu hỏi của bạn, các chú thích định hướng bạn thiết lập và các phát biểu do công cụ soạn khi cuộc tranh luận phát triển. Do đó, nhà cung cấp nhìn thấy văn bản được phái sinh từ và xây dựng xoay quanh nội dung bạn đã nhập. Họ không bao giờ nhận được địa chỉ email, mã định danh tài khoản hoặc phiên, địa chỉ IP hay thông tin thanh toán của bạn.

**Các nhà cung cấp.** Họ được liệt kê trong **Sổ đăng ký Nhà cung cấp AI** của chúng tôi tại \[dezbatere.ro/providers\], là một phần của chính sách này. Đối với từng nhà cung cấp, Sổ đăng ký nêu pháp nhân và quốc gia thành lập; dữ liệu họ nhận và mục đích nhận; các quốc gia hoặc khu vực nơi họ xử lý dữ liệu; điều khoản lưu giữ và việc chế độ không lưu giữ dữ liệu có được kích hoạt đối với điểm cuối và các tính năng chúng tôi sử dụng hay không; theo hợp đồng với chúng tôi, họ có thể dùng dữ liệu đầu vào để huấn luyện hay không; cơ chế chuyển dữ liệu mà chúng tôi dựa vào; và ngày chúng tôi xác minh gần nhất từng mục. Nhà cung cấp có thể thay đổi; Sổ đăng ký có quản lý phiên bản và thay đổi được ghi nhận tại đó.

**Huấn luyện và lưu giữ là hai vấn đề khác nhau.** Hợp đồng của chúng tôi với các nhà cung cấp loại trừ việc sử dụng nội dung của bạn để huấn luyện hoặc cải thiện mô hình của họ. \[Publish only once verified per route.\] Một số nhà cung cấp lưu giữ câu lệnh và phản hồi trong một thời gian giới hạn để bảo mật, ngăn chặn lạm dụng hoặc thực hiện nghĩa vụ pháp lý của chính họ; Sổ đăng ký nêu rõ thời gian và lý do. Khi chế độ không lưu giữ dữ liệu được kích hoạt, Sổ đăng ký nêu rõ điều đó áp dụng cho những tính năng nào. Chúng tôi sẽ không mô tả nội dung là không được lưu giữ khi thực tế không phải vậy.

**Chuyển dữ liệu ra ngoài EEA.** Các nhà cung cấp được thành lập tại Hoa Kỳ nhận dữ liệu theo một trong các cơ chế tại Chương V GDPR: Khung bảo vệ dữ liệu EU–Hoa Kỳ khi pháp nhân ký kết cụ thể được chứng nhận đối với dữ liệu này, hoặc các điều khoản hợp đồng tiêu chuẩn của Ủy ban Châu Âu (Mô-đun Hai, bên kiểm soát chuyển cho bên xử lý), được hỗ trợ bởi đánh giá rủi ro chuyển dữ liệu và các biện pháp bổ sung. Sổ đăng ký nêu cơ chế áp dụng cho từng nhà cung cấp. Bạn có thể nhận bản sao các điều khoản mà chúng tôi dựa vào bằng cách viết đến privacy@dezbatere.ro. Nếu một cơ chế chúng tôi dựa vào bị vô hiệu, chúng tôi chuyển sang cơ chế khác trước khi tiếp tục chuyển dữ liệu và sẽ thông báo cho bạn.

**Các bên nhận khác.** Nhà cung cấp dịch vụ lưu trữ của chúng tôi \[Hetzner, Germany — region …\]; nhà cung cấp dịch vụ phân phối nội dung và truyền tải của chúng tôi \[Cloudflare\]; dịch vụ chuyển tiếp email của chúng tôi \[…\]; \[our payment provider, once a paid plan exists\]. Mỗi bên hành động theo chỉ thị được lập thành văn bản của chúng tôi theo thỏa thuận xử lý dữ liệu với các biện pháp bảo đảm mà Điều 28 yêu cầu, và mỗi bên đều được nêu trong Sổ đăng ký cùng địa điểm và cơ chế chuyển dữ liệu. Chúng tôi không cho phép bất kỳ bên xử lý nào sử dụng dữ liệu của bạn cho mục đích riêng. Nếu một nhà cung cấp làm như vậy, họ là bên kiểm soát theo tư cách riêng và chúng tôi không gửi dữ liệu của bạn cho họ.

**Cơ quan công quyền.** Chúng tôi tiết lộ dữ liệu cá nhân cho tòa án, cơ quan quản lý hoặc cơ quan thực thi pháp luật khi pháp luật yêu cầu và sẽ thông báo cho bạn trừ khi pháp luật ngăn cấm.

## 6. Công khai và khả năng hiển thị

Các cuộc tranh luận là riêng tư cho đến khi bạn công khai chúng. Việc công khai là một hành động có chủ ý và được xác nhận riêng. Một cuộc tranh luận đã công khai hiển thị **bí danh** của bạn, câu hỏi đúng như bạn đã viết, cây lập luận, điểm số, phán quyết và dải độ tin cậy, đồng thời mang nhãn hiển thị rõ ràng rằng nội dung do AI tạo ra. Cuộc tranh luận không bao giờ hiển thị địa chỉ email, hồ sơ phiên hoặc lịch sử tài khoản của bạn. \[Published debates are / are not\] được các công cụ tìm kiếm lập chỉ mục \[unless you choose\].

Việc hủy công khai sẽ gỡ cuộc tranh luận khỏi DebateAI và hủy khóa của bản sao công khai do chúng tôi nắm giữ. Các bản sao mà độc giả, công cụ tìm kiếm hoặc kho lưu trữ đã tạo nằm ngoài tầm kiểm soát của chúng tôi và chúng tôi không thể thu hồi chúng.

Khi bạn xóa tài khoản, chúng tôi gỡ mọi cuộc tranh luận bạn đã công khai khỏi quyền truy cập công cộng mà không chậm trễ quá mức và chậm nhất trong vòng 30 ngày, trừ khi pháp luật yêu cầu chúng tôi lưu giữ một mục cụ thể. \[Option B — a product change; see the Terms, section 9.\]

## 7. Thời gian chúng tôi lưu giữ dữ liệu

| Dữ liệu | Thời gian | Sau đó |
| --- | --- | --- |
| Tài khoản | Trong thời gian tài khoản tồn tại, cộng với thời gian gia hạn 7 ngày sau khi bạn yêu cầu đóng | Khóa bị hủy; hồ sơ bị xóa |
| Hồ sơ phiên | 14 ngày sau lần sử dụng cuối hoặc 90 ngày sau khi tạo, tùy thời điểm nào đến trước | Bị xóa |
| Liên kết xác minh email | 24 giờ | Bị xóa |
| Tín hiệu rủi ro đăng nhập và khôi phục | 90 ngày, được cơ sở dữ liệu thực thi | Bị xóa sạch |
| Dấu vết kiểm toán bảo mật | Trong suốt vòng đời của dịch vụ | Chỉ được phép ghi nối tiếp; IP và tác nhân người dùng là bản tóm lược một chiều và không thể đọc ngược |
| Nội dung tranh luận (riêng tư) | Trong thời gian tài khoản tồn tại | Khóa bị hủy khi đóng, khiến nội dung không thể đọc được |
| Nội dung tranh luận (đã công khai) | Trong thời gian được công khai và tài khoản còn tồn tại | Bị gỡ khỏi quyền truy cập công cộng khi hủy công khai hoặc đóng tài khoản; khóa bị hủy |
| Hồ sơ phản hồi của nhà cung cấp và tham chiếu truy xuất | Giống cuộc tranh luận tương ứng | Như trên |
| Cuộc trò chuyện và vụ việc hỗ trợ | \[Until closed plus 12 months\] | Khóa bị hủy |
| Hồ sơ chấp nhận và đồng ý | Vòng đời tài khoản cộng 6 năm — thời hiệu dài nhất áp dụng cho chúng tôi | Bị xóa |
| Hồ sơ thanh toán \[pending\] | 10 năm, theo yêu cầu của pháp luật kế toán Romania | Bị xóa |
| Bản sao lưu \[pending\] | \[… days\] sau khi bản đang hoạt động bị xóa | Bị ghi đè |

**Việc xóa thực sự có tác dụng gì.** Các cuộc tranh luận và dữ liệu tài khoản của bạn được mã hóa bằng các khóa dành riêng cho tài khoản và từng cuộc tranh luận. Việc xóa tài khoản sẽ hủy các khóa đó, sau đó chúng tôi và bất kỳ ai khác đều không thể đọc được các hồ sơ đã mã hóa, đồng thời chúng tôi xóa hồ sơ tài khoản của bạn. Chúng tôi gọi đây là xóa vì đó chính là tác dụng của việc này và chúng tôi lưu giữ bản đánh giá được lập thành văn bản làm căn cứ; nếu bạn muốn biết thêm, hãy hỏi. Có ba điều cần biết: dấu vết kiểm toán bảo mật chỉ được phép ghi nối tiếp và không bị xóa, nhưng không chứa mã định danh nào của bạn có thể đọc được; một số ít cuộc tranh luận cũ có trước cơ chế mã hóa hiện tại của chúng tôi, và nếu điều đó áp dụng cho tài khoản của bạn, chúng tôi sẽ cho bạn biết việc đóng tài khoản có tác dụng gì đối với chúng; và các bản sao dữ liệu đã được gửi đến nhà cung cấp AI chịu sự điều chỉnh của điều khoản lưu giữ của nhà cung cấp đó trong Sổ đăng ký, chứ không phải việc xóa của chúng tôi.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Quyết định tự động và lập hồ sơ

Điểm số, dấu điều kiện và phán quyết trong một cuộc tranh luận là các đánh giá tự động đối với **lập luận, không phải con người**. Chúng không tạo ra hiệu lực pháp lý đối với bạn và cũng không ảnh hưởng đáng kể tương tự đến bạn. Chúng tôi không đưa ra quyết định nào về bạn chỉ dựa trên xử lý tự động mà có hiệu lực pháp lý hoặc ảnh hưởng đáng kể tương tự, và chúng tôi không lập hồ sơ về bạn.

Nếu trong tương lai chúng tôi tự động hóa một quyết định về tài khoản của bạn — đình chỉ tài khoản, từ chối công khai một cuộc tranh luận — một người sẽ xem xét quyết định đó trước khi có hiệu lực hoặc theo yêu cầu của bạn, bạn sẽ có thể trình bày quan điểm và phản đối quyết định. Điều khoản mô tả cách thức thực hiện.

## 9. Bảo mật và điều xảy ra nếu có sự cố

Mật khẩu được băm bằng Argon2id. Xác thực hai yếu tố là bắt buộc. Địa chỉ email, các cuộc tranh luận, cuộc trò chuyện hỗ trợ và bí mật xác thực của bạn được mã hóa khi lưu trữ bằng các khóa dành riêng cho tài khoản, và khóa cho các cuộc tranh luận đã công khai được lưu riêng với khóa cho các cuộc tranh luận riêng tư. Quyền truy cập dữ liệu môi trường vận hành được ghi nhật ký. Địa chỉ IP và thông tin chi tiết về trình duyệt trong nhật ký bảo mật của chúng tôi chỉ được lưu dưới dạng bản tóm lược một chiều.

Nếu xảy ra vi phạm dữ liệu cá nhân, chúng tôi thông báo cho cơ quan giám sát Romania trong vòng 72 giờ khi pháp luật yêu cầu, đồng thời thông báo trực tiếp cho bạn mà không chậm trễ quá mức khi vi phạm có khả năng gây rủi ro cao đối với các quyền và tự do của bạn. Phụ lục B liệt kê các quy tắc thông báo áp dụng tại những khu vực khác mà chúng tôi phục vụ.

## 10. Các quyền của bạn và cách thực hiện

Bạn có thể thực hiện miễn phí bất kỳ quyền nào trong số này bằng cách viết đến **privacy@dezbatere.ro**, hoặc từ **Cài đặt → Quyền riêng tư** khi có chức năng điều khiển tương ứng. Chúng tôi trả lời trong vòng một tháng; nếu yêu cầu phức tạp, chúng tôi có thể cần thêm tối đa hai tháng và sẽ cho bạn biết lý do. Chúng tôi có thể yêu cầu bạn xác nhận danh tính thông qua tài khoản.

| Quyền | Ý nghĩa trong trường hợp này |
| --- | --- |
| **Truy cập** (Art. 15) | Một bản sao dữ liệu cá nhân chúng tôi lưu giữ về bạn và thông tin này. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Chỉnh sửa** (Art. 16) | Sửa email hoặc email khôi phục của bạn trong phần Cài đặt. Bí danh của bạn không thể thay đổi vì các lý do nêu trong Điều khoản; bạn có thể đóng tài khoản và mở tài khoản mới |
| **Xóa** (Art. 17) | Xóa một cuộc tranh luận riêng tư bất cứ lúc nào từ trang tranh luận. Đóng tài khoản của bạn trong phần Cài đặt; mục 7 giải thích chính xác tác dụng của việc đó. Yêu cầu chúng tôi gỡ một cuộc tranh luận đã công khai có chứa dữ liệu của bạn dù bạn có phải tác giả hay không |
| **Hạn chế** (Art. 18) | Yêu cầu chúng tôi ngừng xử lý dữ liệu cụ thể trong khi tranh chấp liên quan đến dữ liệu đó được giải quyết |
| **Phản đối** (Art. 21) | Phản đối việc xử lý dựa trên lợi ích hợp pháp — hoạt động xử lý bảo mật và kiểm toán tại mục 4 — và chúng tôi sẽ dừng trừ khi có thể chứng minh lý do thuyết phục. Phản đối tiếp thị bất cứ lúc nào và chúng tôi sẽ dừng |
| **Khả năng di chuyển dữ liệu** (Art. 20) | Các cuộc tranh luận và dữ liệu tài khoản của bạn ở định dạng thông dụng, máy có thể đọc được. \[Pending: same export as Access.\] Nội dung không phải dữ liệu cá nhân do bạn tạo, chẳng hạn câu hỏi của bạn, sẽ được trả lại theo yêu cầu khi hợp đồng chấm dứt |
| **Rút lại sự đồng ý** (Art. 7(3)) | Rút lại sự đồng ý tiếp thị từ bất kỳ email nào hoặc trong phần Cài đặt; rút lại sự đồng ý về dữ liệu nhạy cảm bằng cách không đưa dữ liệu đó vào hoặc bằng cách xóa một cuộc tranh luận. Việc rút lại không ảnh hưởng đến hoạt động xử lý đã diễn ra |
| **Khiếu nại** | Gửi đến cơ quan giám sát Romania, **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bucharest, <anspdcp@dataprotection.ro>, hoặc đến cơ quan tại quốc gia nơi bạn sinh sống. Chúng tôi mong bạn liên hệ với chúng tôi trước |

Chúng tôi không bao giờ thu phí đối với yêu cầu và không bao giờ đối xử bất lợi hơn với bạn vì đã đưa ra yêu cầu.

## 11. Người được nêu tên trong các cuộc tranh luận nhưng không phải người dùng của chúng tôi

Nếu ai đó đặt cho DebateAI một câu hỏi có nêu tên bạn, chúng tôi có thể lưu giữ dữ liệu cá nhân về bạn mặc dù bạn chưa từng sử dụng dịch vụ. Điều khoản cấm người dùng làm việc này và chúng tôi giảm thiểu dữ liệu gửi đến các nhà cung cấp AI, nhưng việc đó vẫn xảy ra.

Mục này là thông báo mà chúng tôi phải cung cấp cho bạn theo Điều 14 GDPR. Dữ liệu là bất kỳ nội dung nào người dùng đã nhập và công cụ tạo ra để trả lời; nguồn là người dùng đó; mục đích và cơ sở pháp lý được nêu tại mục 4; bên nhận là các nhà cung cấp AI trong Sổ đăng ký; thời hạn lưu giữ tuân theo mục 7. Bạn có mọi quyền trong mục 10 và đặc biệt có thể yêu cầu chúng tôi gỡ một cuộc tranh luận đã công khai hoặc riêng tư có chứa dữ liệu của bạn và cho bạn biết chúng tôi lưu giữ những gì. Bạn không cần tài khoản để thực hiện. Hãy viết đến **privacy@dezbatere.ro** hoặc sử dụng chức năng **Báo cáo** trên bất kỳ cuộc tranh luận đã công khai nào, và chúng tôi sẽ xử lý yêu cầu có căn cứ mà không chậm trễ quá mức. Chúng tôi không thể thông báo riêng cho bạn khi việc này xảy ra vì không biết bạn là ai hoặc cách liên hệ; thay vào đó, chúng tôi áp dụng thông báo công khai này và phương thức yêu cầu gỡ bỏ.

Điều tương tự áp dụng đối với thông tin nhạy cảm về bạn — chính trị, sức khỏe, tôn giáo — xuất hiện trong câu hỏi của người khác. Không có điều kiện pháp lý nào cho phép chúng tôi tiếp tục xử lý sau khi bạn phản đối, và chúng tôi sẽ không tiếp tục.

## 12. Trẻ em

DebateAI dành cho người trưởng thành. Khi đăng ký, bạn xác nhận mình từ 18 tuổi trở lên và chúng tôi không cố ý xử lý dữ liệu của bất kỳ ai dưới 18 tuổi. Nếu biết một tài khoản thuộc về người dưới 18 tuổi, chúng tôi đóng tài khoản và xóa dữ liệu như mô tả tại mục 7. Một số quốc gia coi việc xác nhận là chưa đủ hoặc yêu cầu thêm; Phụ lục B nêu quy định áp dụng tại từng nơi và Điều khoản giải thích cách chúng tôi xử lý.

## 13. Cookie

Chúng tôi đặt hai cookie, cả hai đều thực sự cần thiết: một cookie duy trì trạng thái đăng nhập của bạn và một cookie bảo vệ biểu mẫu khỏi hành vi giả mạo. Chúng tôi không đặt cookie phân tích, quảng cáo hoặc theo dõi. **Chính sách Cookie** tại \[dezbatere.ro/cookies\] liệt kê các cookie cùng thời hạn, giải thích cách lựa chọn của bạn được lưu trữ và sẽ được thay đổi trước khi bất kỳ cookie nào khác được thêm vào. Khi pháp luật tại khu vực của bạn áp dụng cách xử lý khác đối với một số cookie — ví dụ quy tắc từ chối tham gia của Vương quốc Anh đối với dữ liệu phân tích — Chính sách Cookie sẽ nêu rõ.

## 14. Thay đổi đối với chính sách này

Khi thay đổi chính sách này, chúng tôi đăng phiên bản mới kèm bản tóm tắt những thay đổi và ngày hiệu lực mới, đồng thời lưu các phiên bản trước tại \[dezbatere.ro/privacy/versions\]. Đối với thay đổi bổ sung mục đích mới hoặc bên nhận mới, chúng tôi thông báo cho bạn trước khi hoạt động xử lý mới bắt đầu, qua email và trong sản phẩm, đồng thời dành cho bạn thời gian phản đối. Khi mục đích mới phụ thuộc vào sự đồng ý của bạn — ví dụ nếu sau này chúng tôi muốn sử dụng nội dung để cải thiện mô hình — chúng tôi sẽ xin sự đồng ý đó một cách riêng biệt và cụ thể; chúng tôi không bao giờ coi việc chấp nhận Điều khoản cập nhật là sự đồng ý cho hoạt động xử lý mới. Đối với các nội dung làm rõ không làm thay đổi cách chúng tôi hành động, chúng tôi chỉ đăng phiên bản mới.

Chính sách này được cập nhật lần cuối vào \[date\]. Phiên bản 3.0 thay thế phiên bản 2.1, vốn mô tả dữ liệu phiên, thời hạn lưu giữ, dữ liệu phân tích, việc xuất dữ liệu và tác dụng của việc xóa đối với các cuộc tranh luận đã công khai theo những cách không còn phản ánh đúng dịch vụ.

## Annex B — Điều khoản quyền riêng tư theo khu vực

Mỗi mục chỉ áp dụng nếu khu vực tương ứng được liệt kê tại mục 2 của Điều khoản và chỉ nêu những điểm khác với nội dung chính của chính sách này.

### B.1 Liên minh Châu Âu và Khu vực Kinh tế Châu Âu

Nội dung chính của chính sách này được soạn cho bạn. Cơ quan giám sát của chúng tôi là **ANSPDCP** của Romania; bạn cũng có thể khiếu nại đến cơ quan tại quốc gia nơi bạn sinh sống. Người dùng Romania: chính sách này có bản tiếng Romania tại \[URL\].

### B.2 Vương quốc Anh *(chỉ khi được liệt kê)*

Đại diện của chúng tôi tại Vương quốc Anh theo Điều 27 UK GDPR là **\[name, address, email\]**; bạn có thể liên hệ với họ về bất kỳ vấn đề nào trong chính sách này. Cơ quan giám sát là **Văn phòng Ủy viên Thông tin**, [ico.org.uk](https://ico.org.uk). Bạn có thể khiếu nại với chúng tôi qua biểu mẫu tại \[URL\] và chúng tôi xác nhận tiếp nhận trong vòng 30 ngày. Việc chuyển dữ liệu của bạn từ Vương quốc Anh đến các nhà cung cấp AI tại Hoa Kỳ dựa trên \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], được hỗ trợ bởi đánh giá rủi ro chuyển dữ liệu. Nếu sau này chúng tôi đặt cookie phân tích, tại Vương quốc Anh chúng sẽ thuộc cơ chế từ chối tham gia thay vì xin sự đồng ý; hiện nay chúng tôi không đặt cookie đó. Nếu bạn dưới 18 tuổi và vẫn truy cập dịch vụ bất chấp quy tắc độ tuổi của chúng tôi, các tiêu chuẩn trong Bộ quy tắc Trẻ em của ICO sẽ được áp dụng cho cách chúng tôi xử lý dữ liệu của bạn.

### B.3 Hoa Kỳ *(chỉ khi được liệt kê)*

**Thông báo tại thời điểm thu thập.** Bảng tại mục 2 liệt kê từng loại thông tin cá nhân chúng tôi thu thập, mục đích và thời gian lưu giữ (mục 7). Chúng tôi chỉ thu thập các loại thông tin cá nhân *nhạy cảm* sau đây khi bạn đưa chúng vào câu hỏi của chính mình: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], và chỉ sử dụng để vận hành các cuộc tranh luận của bạn. **Chúng tôi không bán hoặc chia sẻ thông tin cá nhân và đã không làm như vậy trong mười hai tháng trước đó.** Chúng tôi không sử dụng thông tin cá nhân nhạy cảm cho bất kỳ mục đích nào ngoài việc cung cấp dịch vụ bạn yêu cầu. **Tín hiệu tùy chọn từ chối tham gia:** chúng tôi tôn trọng tín hiệu Global Privacy Control như một yêu cầu từ chối việc bán hoặc chia sẻ, là những việc trong mọi trường hợp chúng tôi đều không thực hiện. **Các quyền của bạn:** quyền được biết, xóa, sửa, từ chối tham gia, hạn chế việc sử dụng thông tin cá nhân nhạy cảm và không bị phân biệt đối xử vì thực hiện các quyền đó; hãy gửi yêu cầu tại privacy@dezbatere.ro hoặc \[toll-free number / form\]. **Ưu đãi tài chính:** chúng tôi không cung cấp ưu đãi nào; gói miễn phí và trả phí không khác nhau về cách chúng tôi xử lý dữ liệu của bạn. **Thời hạn lưu giữ** được nêu tại mục 7. Thông báo này được cập nhật ít nhất mỗi mười hai tháng; cập nhật lần cuối \[date\].

*Washington:* **Thông báo Quyền riêng tư về Dữ liệu Sức khỏe Người tiêu dùng** của chúng tôi tại \[URL\] là một tài liệu riêng áp dụng cho mọi thông tin liên quan đến sức khỏe, bao gồm cả các suy luận. *Texas và Nebraska:* chúng tôi không bán dữ liệu cá nhân nhạy cảm; nếu điều đó thay đổi, trước tiên chúng tôi sẽ xin sự đồng ý của bạn \[statutory language\]. *Colorado, Connecticut, Virginia và các tiểu bang khác có luật quyền riêng tư toàn diện:* các quyền nêu trên áp dụng cho bạn khi pháp luật áp dụng cho chúng tôi; hãy khiếu nại việc từ chối yêu cầu bằng cách viết đến \[appeals@dezbatere.ro\].

### B.4 Canada và Quebec *(chỉ khi được liệt kê)*

Cán bộ phụ trách quyền riêng tư của chúng tôi là **\[name, email\]**. Chúng tôi vẫn chịu trách nhiệm đối với thông tin cá nhân được chuyển đến các nhà cung cấp AI ngoài Canada và sử dụng hợp đồng để yêu cầu mức bảo vệ tương đương; các nhà cung cấp đó có thể chịu sự điều chỉnh của pháp luật tại quốc gia nơi họ hoạt động, bao gồm quyền tiếp cận hợp pháp của cơ quan công quyền. Email tiếp thị chỉ được gửi khi có sự đồng ý rõ ràng của bạn theo CASL. **Quebec:** trước khi truyền đạt thông tin cá nhân ra ngoài Quebec, chúng tôi thực hiện đánh giá tác động về quyền riêng tư; các cài đặt giữ cuộc tranh luận của bạn ở chế độ riêng tư được bật mặc định; bạn có thể yêu cầu chúng tôi gỡ khỏi chỉ mục hoặc ngừng phổ biến thông tin cá nhân về bạn; bạn có thể yêu cầu dữ liệu ở định dạng có cấu trúc, thông dụng; mục 8 mô tả hoạt động xử lý tự động của chúng tôi.

### B.5 Australia và New Zealand *(chỉ khi được liệt kê)*

**Australia.** Bên nhận thông tin cá nhân của bạn ở nước ngoài là các nhà cung cấp AI và bên xử lý được liệt kê trong Sổ đăng ký, đặt tại \[the United States and the European Union\]; chúng tôi thực hiện các bước hợp lý để bảo đảm họ xử lý dữ liệu phù hợp với Các Nguyên tắc Quyền riêng tư của Australia. **Quyết định tự động:** kể từ ngày 10 tháng 12 năm 2026, chính sách này xác định các loại quyết định do chương trình máy tính đưa ra có ảnh hưởng đáng kể đến quyền hoặc lợi ích của bạn — không có quyết định nào như vậy; điểm số và phán quyết liên quan đến lập luận chứ không phải bạn — và thông tin cá nhân được sử dụng trong đó. Có thể gửi khiếu nại đến **Văn phòng Ủy viên Thông tin Australia**. **New Zealand.** Cán bộ phụ trách quyền riêng tư của chúng tôi là \[name\]. Khi chúng tôi thu thập thông tin cá nhân về bạn một cách gián tiếp — vì người dùng khác đưa thông tin đó vào câu hỏi — chính sách này và mục 11 là thông báo chúng tôi cung cấp. Chúng tôi tiết lộ dữ liệu cho các nhà cung cấp AI trong Sổ đăng ký với tư cách đại lý của mình, theo hợp đồng yêu cầu biện pháp bảo đảm tương đương. Có thể gửi khiếu nại đến **Văn phòng Ủy viên Quyền riêng tư**.

### B.6 Châu Mỹ Latinh *(phụ lục bằng tiếng Tây Ban Nha; chỉ khi được liệt kê)*

&#91;Published in Spanish.\] Sự đồng ý là cơ sở xử lý khi không có sự cần thiết theo hợp đồng. Các quyền ARCO — truy cập, chỉnh sửa, hủy bỏ, phản đối — có thể được thực hiện tại privacy@dezbatere.ro, với câu trả lời trong vòng \[per country\]. *Mexico:* *aviso de privacidad* đầy đủ với các yếu tố bắt buộc được đăng tại \[URL\]. *Argentina:* \[AAIP mandatory legend\]; dữ liệu được đăng ký với \[…\]. *Colombia:* *política de tratamiento de datos* của chúng tôi có tại \[URL\]; cơ quan có thẩm quyền là SIC. *Chile* (từ ngày 1 tháng 12 năm 2026): thông tin liên hệ của Cơ quan là \[…\]; mục 8 giải thích hoạt động xử lý tự động của chúng tôi.

### B.7 Vùng Vịnh — UAE và Saudi Arabia *(chỉ khi được liệt kê)*

Khi xử lý dữ liệu của bạn cho các mục đích khác ngoài cung cấp dịch vụ, chúng tôi dựa vào sự đồng ý của bạn và bạn có thể rút lại. Dữ liệu của bạn rời khỏi \[UAE / Kingdom of Saudi Arabia\] và được xử lý tại Liên minh Châu Âu và Hoa Kỳ theo \[SDAIA standard contractual clauses / the mechanism in the Register\]. Nội dung tiếp thị chỉ được gửi khi có sự đồng ý của bạn. Không đưa dữ liệu cá nhân nhạy cảm vào câu hỏi.

### B.8 Châu Á–Thái Bình Dương *(chỉ các dòng dành cho khu vực được liệt kê)*

*Singapore:* Cán bộ Bảo vệ Dữ liệu của chúng tôi là **\[name, email\]**; hoạt động chuyển dữ liệu dựa trên các nghĩa vụ hợp đồng đem lại mức bảo vệ tương đương với PDPA; chúng tôi thông báo cho PDPC về các vi phạm phải thông báo trong vòng 3 ngày. *Nhật Bản:* chúng tôi sử dụng thông tin cá nhân của bạn cho các mục đích tại mục 4 và không cho mục đích nào khác; nội dung của bạn được chuyển đến các nhà cung cấp tại \[named countries — e.g. the United States\], nơi có chế độ quyền riêng tư và biện pháp bảo đảm được mô tả trong Sổ đăng ký, và bạn đồng ý với việc này khi đăng ký. *Hàn Quốc:* Cán bộ phụ trách Quyền riêng tư của chúng tôi là **\[name\]**; các hạng mục, nơi đến, thời điểm, bên nhận, mục đích và thời hạn lưu giữ của hoạt động chuyển dữ liệu ra nước ngoài được nêu trong Sổ đăng ký; quan điểm chính trị trong câu hỏi của bạn là thông tin nhạy cảm và chúng tôi chỉ xử lý để vận hành các cuộc tranh luận; sự đồng ý đối với hoạt động xử lý tùy chọn được thu thập riêng. *Ấn Độ* (khi các quy tắc DPDP được áp dụng): thông báo đồng ý độc lập tại \[URL\] được áp dụng; yêu cầu được trả lời trong vòng 90 ngày; người dùng dưới 18 tuổi cần có sự đồng ý có thể xác minh của cha mẹ. *Philippines:* DPO của chúng tôi là \[name\]; có thể nộp khiếu nại lên Ủy ban Quyền riêng tư Quốc gia; mục 8 mô tả hoạt động xử lý tự động. *Thái Lan:* đại diện của chúng tôi là \[name\] \[if appointed\].

### B.9 Dành riêng

Thổ Nhĩ Kỳ, Brazil và Indonesia đều yêu cầu thông báo bằng ngôn ngữ địa phương, đại diện hoặc đăng ký và các thủ tục nộp hồ sơ; các nội dung đó chưa được soạn tại đây. Trung Quốc, Việt Nam và Nga không thuộc phạm vi phục vụ.
