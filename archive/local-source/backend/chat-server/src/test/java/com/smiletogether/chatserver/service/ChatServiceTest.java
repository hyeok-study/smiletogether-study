package com.smiletogether.chatserver.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smiletogether.chatserver.dto.ChannelMessageDto;
import com.smiletogether.chatserver.dto.WorkspaceProfileDto;
import com.smiletogether.chatserver.dto.request.ChannelMessageRequest;
import com.smiletogether.chatserver.infrastructure.ExternalProfileApiClient;
import com.smiletogether.chatserver.service.producer.MessageProducer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock
    private MessageProducer messageProducer;

    @Mock
    private ExternalProfileApiClient externalProfileApiClient;

    @InjectMocks
    private ChatService chatService;

    @Test
    void sendChannelMessagePublishesMessageWithProfileAndTraceableContent() {
        String token = "Bearer test-token";
        String userId = "user-1";
        String workspaceId = "workspace-1";
        String channelId = "channel-1";
        String content = "[run-1][vu-1][seq-1][sentAt-1000] hello";
        WorkspaceProfileDto profile = new WorkspaceProfileDto(
                userId, "Tester", "profile.png", "QA", true, "testing"
        );
        when(externalProfileApiClient.getWorkspaceProfile(token, workspaceId, userId)).thenReturn(profile);

        chatService.sendChannelMessage(
                token, userId, workspaceId, channelId, new ChannelMessageRequest("SEND", content)
        );

        ArgumentCaptor<ChannelMessageDto> captor = ArgumentCaptor.forClass(ChannelMessageDto.class);
        verify(messageProducer).sendMessage(captor.capture());
        ChannelMessageDto published = captor.getValue();

        assertThat(published.type()).isEqualTo("SEND");
        assertThat(published.workspaceId()).isEqualTo(workspaceId);
        assertThat(published.channelId()).isEqualTo(channelId);
        assertThat(published.user()).isEqualTo(profile);
        assertThat(published.content()).isEqualTo(content);
        assertThat(published.token()).isEqualTo(token);
        assertThat(published.messageId()).isNotBlank();
        assertThat(published.createdAt()).isNotNull();
    }

    @Test
    void sendChannelMessageUsesFallbackProfileWhenSpaceServerIsUnavailable() {
        String token = "Bearer test-token";
        String userId = "user-1";
        String workspaceId = "workspace-1";
        when(externalProfileApiClient.getWorkspaceProfile(token, workspaceId, userId)).thenReturn(null);

        chatService.sendChannelMessage(
                token, userId, workspaceId, "channel-1", new ChannelMessageRequest("SEND", "hello")
        );

        ArgumentCaptor<ChannelMessageDto> captor = ArgumentCaptor.forClass(ChannelMessageDto.class);
        verify(messageProducer).sendMessage(captor.capture());

        assertThat(captor.getValue().user().userId()).isEqualTo(userId);
        assertThat(captor.getValue().user().displayName()).isEqualTo("익명 사용자");
    }
}
