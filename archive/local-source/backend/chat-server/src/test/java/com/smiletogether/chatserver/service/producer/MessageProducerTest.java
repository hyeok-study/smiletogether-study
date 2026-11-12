package com.smiletogether.chatserver.service.producer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.smiletogether.chatserver.dto.ChannelMessageDto;
import com.smiletogether.chatserver.dto.WorkspaceProfileDto;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

@ExtendWith(MockitoExtension.class)
class MessageProducerTest {

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    private MessageProducer messageProducer;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        messageProducer = new MessageProducer(kafkaTemplate, objectMapper);
    }

    @Test
    void sendMessagePublishesSamePayloadToChatHistoryAndNotificationTopics() {
        ChannelMessageDto dto = new ChannelMessageDto(
                "SEND",
                "message-1",
                "workspace-1",
                "channel-1",
                new WorkspaceProfileDto("user-1", "Tester", "profile.png", "QA", true, "testing"),
                "[run-1][vu-1][seq-1][sentAt-1000] hello",
                "Bearer token",
                LocalDateTime.of(2025, 1, 1, 0, 0),
                LocalDateTime.of(2025, 1, 1, 0, 0),
                false
        );

        messageProducer.sendMessage(dto);

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("channel-topic"), eq("channel-1"), payloadCaptor.capture());
        verify(kafkaTemplate).send(eq("history-topic"), eq("channel-1"), payloadCaptor.capture());
        verify(kafkaTemplate).send(eq("notification-topic"), anyString());

        assertThat(payloadCaptor.getAllValues()).hasSize(2);
        assertThat(payloadCaptor.getAllValues().get(0)).isEqualTo(payloadCaptor.getAllValues().get(1));
        assertThat(payloadCaptor.getAllValues().get(0)).contains("message-1", "run-1", "Bearer token");
    }
}
